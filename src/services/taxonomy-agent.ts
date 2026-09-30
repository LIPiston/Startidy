/**
 * Taxonomy agent: supervises the classification run.
 *
 * After every batch, the agent
 *   1. embeds the batch and compares it against the centroid of every
 *      category as it was *before* the batch was filed in, so repositories
 *      the classifier forced into a wrong category still show up as fitting
 *      nowhere ("add" evidence),
 *   2. looks for categories whose members drifted into two similarity
 *      clusters ("split" evidence),
 *   3. asks the model to confirm one decision with concrete names,
 *   4. applies it: new categories join the taxonomy, split categories are
 *      replaced by their parts and the affected repositories are queued for
 *      re-classification.
 *
 * Every step is optional: when the embedding endpoint is unavailable the
 * caller skips the agent and the normal flow continues.
 */
import type { Category } from "../types";
import { UNCATEGORIZED_CATEGORY_NAME } from "../types";
import type { Config } from "../utils/config";
import type { AIService } from "./ai";
import {
  categoryEmbeddingText,
  centroid,
  cosineSimilarity,
  crossSimilarity,
  meanPairwiseSimilarity,
  repoEmbeddingText,
  type EmbeddingClient,
} from "./embeddings";
import {
  buildTaxonomyAgentPrompt,
  type AgentRepoLine,
  type AgentSignal,
  type HomelessSignal,
  type SplitSignal,
} from "../prompts/taxonomy-agent";
import {
  extractJsonPayload,
  isLanguageCategory,
  normalizeCategoryName,
  repairTruncatedJson,
} from "./response-parser";

/** Minimum metadata the agent needs about a repository. */
export type AgentRepo = AgentRepoLine;

export interface AgentAddChange {
  action: "add";
  added: Category;
  members: string[];
  reason: string;
}

export interface AgentSplitChange {
  action: "split";
  removed: Category;
  parts: Category[];
  members: string[];
  reason: string;
}

export type AgentChange = AgentAddChange | AgentSplitChange;

export interface TaxonomyReview {
  /** Taxonomy after the review (new categories added, splits applied) */
  categories: Category[];
  changes: AgentChange[];
  /** Repository ids whose assignment must be dropped and classified again */
  requeue: string[];
}

export interface ReviewTaxonomyInput {
  config: Config;
  ai: AIService;
  embeddings: EmbeddingClient;
  categories: Category[];
  assignments: Map<string, string[]>;
  /** Repositories of the batch that was just classified */
  batchRepos: AgentRepo[];
  /** Every repository known to this run, by id */
  repoInfo: Map<string, AgentRepo>;
  /** Repo id -> vector, shared across batches so nothing is embedded twice */
  vectorCache: Map<string, number[]>;
}

/** Upper bound of members sampled per category when computing centroids */
const MAX_CENTROID_SAMPLES = 40;
/** Upper bound of members sampled when looking for a split */
const MAX_SPLIT_SAMPLES = 60;
const KMEANS_ITERATIONS = 8;

/**
 * Runs the taxonomy review. Returns `null` when the evidence is too weak,
 * the model decided to keep the taxonomy, or every proposed change was
 * rejected by the guardrails.
 */
export async function reviewTaxonomy(
  input: ReviewTaxonomyInput,
): Promise<TaxonomyReview | null> {
  const { config, ai, embeddings, categories, assignments } = input;

  const vectorFor = async (id: string): Promise<number[] | null> => {
    const cached = input.vectorCache.get(id);
    if (cached) return cached;
    const info = input.repoInfo.get(id);
    if (!info) return null;
    const [vector] = await embeddings.embed([repoEmbeddingText(info)]);
    if (!vector || vector.length === 0) return null;
    input.vectorCache.set(id, vector);
    return vector;
  };

  // Members collected so far, per category name
  const membersOf = new Map<string, string[]>();
  for (const category of categories) membersOf.set(category.name, []);
  for (const [id, names] of assignments) {
    for (const name of names) {
      const list = membersOf.get(name);
      if (list) list.push(id);
    }
  }

  // The batch was just filed into these categories, so it must not count as
  // evidence that the batch belongs there: the "fits nothing" test compares
  // the batch against the category as it was BEFORE this batch arrived.
  const batchIds = new Set(input.batchRepos.map((repo) => repo.id));

  // Category centroids (falling back to the category description when empty)
  const centroids = new Map<string, number[]>();
  for (const category of categories) {
    const memberIds = (membersOf.get(category.name) ?? []).filter(
      (id) => !batchIds.has(id),
    );
    const sample = sampleEvenly(memberIds, MAX_CENTROID_SAMPLES);
    const vectors = (
      await Promise.all(sample.map((id) => vectorFor(id)))
    ).filter((vector): vector is number[] => vector !== null);

    if (vectors.length > 0) {
      centroids.set(category.name, centroid(vectors));
    } else {
      const [fallback] = await embeddings.embed([categoryEmbeddingText(category)]);
      if (fallback && fallback.length > 0) centroids.set(category.name, fallback);
    }
  }

  // Batch vectors
  const batchVectors = new Map<string, number[]>();
  for (const repo of input.batchRepos) {
    const vector = await vectorFor(repo.id);
    if (vector) batchVectors.set(repo.id, vector);
  }

  const signals: AgentSignal[] = [
    ...detectHomeless(config, batchVectors, centroids),
    ...(await detectSplits(config, membersOf, vectorFor)),
  ];

  if (config.debug) {
    console.log(
      `[agent] batch=${input.batchRepos.length} vectors=${batchVectors.size} centroids=${centroids.size} signals=${signals.length}`,
    );
  }

  if (signals.length === 0) return null;

  const prompt = buildTaxonomyAgentPrompt({
    categories,
    memberCounts: new Map(
      [...membersOf].map(([name, ids]) => [name, ids.length] as const),
    ),
    batchRepos: input.batchRepos,
    signals,
    maxCategories: config.maxCategories,
    maxDecisions: config.agentMaxDecisions,
    minMembers: config.agentMinNewMembers,
  });

  const text = await ai.reviewTaxonomy(prompt);
  const decisions = parseDecisions(text);
  if (decisions.length === 0) return null;

  return applyDecisions({ ...input, membersOf, signals, decisions, vectorFor });
}

/* ------------------------------------------------------------------ */
/* Evidence detection                                                  */
/* ------------------------------------------------------------------ */

/** Repositories of the batch that fit none of the categories. */
function detectHomeless(
  config: Config,
  batchVectors: Map<string, number[]>,
  centroids: Map<string, number[]>,
): HomelessSignal[] {
  if (centroids.size === 0) return [];

  const homeless: Array<{
    id: string;
    vector: number[];
    nearestCategory: string | null;
    nearestSimilarity: number;
  }> = [];

  for (const [id, vector] of batchVectors) {
    let nearestSimilarity = -1;
    let nearestCategory: string | null = null;
    for (const [name, centroidVector] of centroids) {
      const similarity = cosineSimilarity(vector, centroidVector);
      if (similarity > nearestSimilarity) {
        nearestSimilarity = similarity;
        nearestCategory = name;
      }
    }
    if (nearestSimilarity < config.agentSimilarityThreshold) {
      homeless.push({ id, vector, nearestCategory, nearestSimilarity });
    }
  }

  if (homeless.length < config.agentMinNewMembers) return [];

  const sorted = [...homeless].sort(
    (a, b) => a.nearestSimilarity - b.nearestSimilarity,
  );
  const used = new Set<string>();
  const signals: HomelessSignal[] = [];

  for (const seed of sorted) {
    if (used.has(seed.id)) continue;
    used.add(seed.id);
    const group = [seed];

    for (const other of sorted) {
      if (used.has(other.id)) continue;
      if (
        cosineSimilarity(seed.vector, other.vector) >=
        config.agentClusterSimilarity
      ) {
        used.add(other.id);
        group.push(other);
      }
    }

    if (group.length >= config.agentMinNewMembers) {
      signals.push({
        kind: "add",
        members: group.map((item) => item.id),
        meanSimilarity: meanPairwiseSimilarity(group.map((item) => item.vector)),
        nearestCategory: seed.nearestCategory,
        nearestSimilarity: seed.nearestSimilarity,
      });
    }
  }

  return signals;
}

/** Categories whose members split into two similarity clusters. */
async function detectSplits(
  config: Config,
  membersOf: Map<string, string[]>,
  vectorFor: (id: string) => Promise<number[] | null>,
): Promise<SplitSignal[]> {
  const signals: SplitSignal[] = [];
  const minimum = config.agentMinSplitMembers;

  for (const [name, memberIds] of membersOf) {
    if (name === UNCATEGORIZED_CATEGORY_NAME) continue;
    if (memberIds.length < minimum * 2) continue;

    const sample = sampleEvenly(memberIds, MAX_SPLIT_SAMPLES);
    const entries = (
      await Promise.all(
        sample.map(async (id) => [id, await vectorFor(id)] as const),
      )
    ).filter((entry): entry is [string, number[]] => entry[1] !== null);

    if (entries.length < minimum * 2) continue;

    const [left, right] = kmeans2(entries.map((entry) => entry[1]));
    if (left.length < minimum || right.length < minimum) continue;

    const leftVectors = left.map((index) => entries[index][1]);
    const rightVectors = right.map((index) => entries[index][1]);
    const leftIntra = meanPairwiseSimilarity(leftVectors);
    const rightIntra = meanPairwiseSimilarity(rightVectors);
    const intra =
      (leftIntra * left.length + rightIntra * right.length) /
      (left.length + right.length);
    const cross = crossSimilarity(leftVectors, rightVectors);
    const gap = intra - cross;

    if (gap < config.agentSplitGap) continue;

    signals.push({
      kind: "split",
      category: name,
      memberCount: memberIds.length,
      clusters: [
        { members: left.map((index) => entries[index][0]), intraSimilarity: leftIntra },
        { members: right.map((index) => entries[index][0]), intraSimilarity: rightIntra },
      ],
      crossSimilarity: cross,
      gap,
    });
  }

  return signals;
}

/* ------------------------------------------------------------------ */
/* Decision parsing and application                                    */
/* ------------------------------------------------------------------ */

interface RawAddDecision {
  action: "add";
  name?: string;
  description?: string;
  members?: string[];
  reason?: string;
}

interface RawSplitDecision {
  action: "split";
  category?: string;
  parts?: Array<{ name?: string; description?: string; members?: string[] }>;
  reason?: string;
}

type RawDecision =
  | RawAddDecision
  | RawSplitDecision
  | { action: "keep"; reason?: string };

function parseDecisions(text: string): RawDecision[] {
  try {
    const parsed = JSON.parse(repairTruncatedJson(extractJsonPayload(text)));
    const decisions = Array.isArray(parsed) ? parsed : parsed?.decisions;
    if (!Array.isArray(decisions)) return [];
    return decisions.filter(
      (decision): decision is RawDecision =>
        !!decision && typeof decision === "object" && typeof decision.action === "string",
    );
  } catch {
    return [];
  }
}

interface ApplyInput extends ReviewTaxonomyInput {
  membersOf: Map<string, string[]>;
  signals: AgentSignal[];
  decisions: RawDecision[];
  vectorFor: (id: string) => Promise<number[] | null>;
}

async function applyDecisions(input: ApplyInput): Promise<TaxonomyReview | null> {
  const { config, membersOf, signals, decisions, vectorFor } = input;
  let categories = [...input.categories];
  const existing = new Set(categories.map((category) => category.name));
  const changes: AgentChange[] = [];
  const requeue = new Set<string>();
  const maxDecisions = Math.max(1, config.agentMaxDecisions);

  for (const decision of decisions.slice(0, maxDecisions)) {
    if (decision.action === "add") {
      const change = applyAdd(input, decision, categories, existing);
      if (!change) continue;
      categories.push(change.added);
      existing.add(change.added.name);
      change.members.forEach((id) => requeue.add(id));
      changes.push(change);
      continue;
    }

    if (decision.action === "split") {
      const result = await applySplit(
        input,
        decision,
        categories,
        existing,
        vectorFor,
      );
      if (!result) continue;
      categories = result.categories;
      result.change.members.forEach((id) => requeue.add(id));
      changes.push(result.change);
    }
  }

  if (changes.length === 0) return null;
  return { categories, changes, requeue: [...requeue] };
}

function applyAdd(
  input: ApplyInput,
  decision: RawAddDecision,
  categories: Category[],
  existing: Set<string>,
): AgentAddChange | null {
  const name = normalizeCategoryName(decision.name ?? "");
  if (!name || existing.has(name) || isLanguageCategory(name)) return null;
  if (categories.length >= input.config.maxCategories) return null;

  const minimum = input.config.agentMinNewMembers;
  const known = new Set(input.repoInfo.keys());
  let members = (decision.members ?? []).filter((id) => known.has(id));

  // A model that lists too few members still gets the benefit of the doubt:
  // fall back to the group the evidence came from.
  if (members.length < minimum) {
    const signal = bestAddSignal(input.signals, members);
    if (!signal) return null;
    members = signal.members;
  }
  if (members.length < minimum) return null;

  return {
    action: "add",
    added: { name, description: decision.description?.trim() || name, keywords: [] },
    members: [...new Set(members)],
    reason: decision.reason?.trim() || "repositories fit no existing category",
  };
}

/** The homeless group that overlaps the given members the most. */
function bestAddSignal(
  signals: AgentSignal[],
  members: string[],
): HomelessSignal | null {
  let best: HomelessSignal | null = null;
  let bestOverlap = 0;

  for (const signal of signals) {
    if (signal.kind !== "add") continue;
    const overlap = signal.members.filter((id) => members.includes(id)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = signal;
    }
  }

  return best;
}

async function applySplit(
  input: ApplyInput,
  decision: RawSplitDecision,
  categories: Category[],
  existing: Set<string>,
  vectorFor: (id: string) => Promise<number[] | null>,
): Promise<{ categories: Category[]; change: AgentSplitChange } | null> {
  const parentName = normalizeCategoryName(decision.category ?? "");
  const parent = categories.find((category) => category.name === parentName);
  if (!parent) return null;

  const parentMembers = input.membersOf.get(parent.name) ?? [];
  const minimum = input.config.agentMinNewMembers;
  const rawParts = (decision.parts ?? []).filter(
    (part) => part && typeof part === "object",
  );
  if (rawParts.length < 2 || rawParts.length > 4) return null;

  const names: string[] = [];
  for (const part of rawParts) {
    const name = normalizeCategoryName(part.name ?? "");
    if (!name || name === parent.name || existing.has(name) || names.includes(name)) {
      return null;
    }
    if (isLanguageCategory(name)) return null;
    names.push(name);
  }

  const signal = input.signals.find(
    (item): item is SplitSignal =>
      item.kind === "split" && item.category === parent.name,
  );

  // Seed every part with the members the model listed, falling back to the
  // embedding clusters (which is where the evidence came from).
  const parentSet = new Set(parentMembers);
  const seeds: string[][] = rawParts.map((part, index) => {
    const listed = (part.members ?? []).filter((id) => parentSet.has(id));
    if (listed.length >= minimum) return [...new Set(listed)];
    const cluster = signal?.clusters[index];
    return cluster ? cluster.members : [];
  });

  if (seeds.some((members) => members.length < minimum)) return null;

  // Assign every member of the parent to the nearest part centroid.
  const assignedSeeds = seeds.map((members) => [...new Set(members)]);
  const claimed = new Set(assignedSeeds.flat());
  const leftovers = parentMembers.filter((id) => !claimed.has(id));

  const centroids: number[][] = [];
  for (const members of assignedSeeds) {
    const vectors = (
      await Promise.all(members.map((id) => vectorFor(id)))
    ).filter((vector): vector is number[] => vector !== null);
    centroids.push(vectors.length > 0 ? centroid(vectors) : []);
  }

  const finalMembers: string[][] = assignedSeeds.map((members) => [...members]);
  for (const id of leftovers) {
    const vector = await vectorFor(id);
    let bestIndex = 0;
    let bestSimilarity = -Infinity;
    for (let index = 0; index < centroids.length; index++) {
      const similarity =
        vector && centroids[index].length > 0
          ? cosineSimilarity(vector, centroids[index])
          : 0;
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestIndex = index;
      }
    }
    finalMembers[bestIndex].push(id);
  }

  if (finalMembers.some((members) => members.length < minimum)) return null;

  const parts: Category[] = names.map((name, index) => ({
    name,
    description: rawParts[index].description?.trim() || name,
    keywords: [],
  }));

  if (categories.length - 1 + parts.length > input.config.maxCategories) return null;

  categories = categories
    .filter((category) => category.name !== parent.name)
    .concat(parts);
  existing.delete(parent.name);
  parts.forEach((part) => existing.add(part.name));

  return {
    categories,
    change: {
      action: "split",
      removed: parent,
      parts,
      members: [...new Set(finalMembers.flat())],
      reason: decision.reason?.trim() || "members drifted into separate clusters",
    },
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Evenly samples at most `limit` items, keeping the original order. */
function sampleEvenly<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return [...items];
  const step = items.length / limit;
  const sampled: T[] = [];
  for (let index = 0; index < limit; index++) {
    sampled.push(items[Math.floor(index * step)]);
  }
  return sampled;
}

/**
 * Two-means with a deterministic seed: the two least similar vectors become
 * the initial centroids. Returns the indices of both clusters.
 */
function kmeans2(vectors: number[][]): [number[], number[]] {
  if (vectors.length < 2) return [[0], []];

  let seedA = 0;
  let seedB = 1;
  let worst = Infinity;
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const similarity = cosineSimilarity(vectors[i], vectors[j]);
      if (similarity < worst) {
        worst = similarity;
        seedA = i;
        seedB = j;
      }
    }
  }

  let centroids = [vectors[seedA], vectors[seedB]];
  let left: number[] = [];
  let right: number[] = [];

  for (let iteration = 0; iteration < KMEANS_ITERATIONS; iteration++) {
    left = [];
    right = [];
    for (let index = 0; index < vectors.length; index++) {
      const toLeft = cosineSimilarity(vectors[index], centroids[0]);
      const toRight = cosineSimilarity(vectors[index], centroids[1]);
      if (toLeft >= toRight) left.push(index);
      else right.push(index);
    }

    if (left.length === 0 || right.length === 0) break;

    const nextLeft = centroid(left.map((index) => vectors[index]));
    const nextRight = centroid(right.map((index) => vectors[index]));
    const converged =
      cosineSimilarity(centroids[0], nextLeft) > 0.9999 &&
      cosineSimilarity(centroids[1], nextRight) > 0.9999;
    centroids = [nextLeft, nextRight];
    if (converged) break;
  }

  return [left, right];
}
