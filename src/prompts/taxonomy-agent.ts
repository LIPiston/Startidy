/**
 * Prompt for the taxonomy agent: the supervisor that looks at the numeric
 * embedding evidence collected after every classification batch and decides
 * whether the taxonomy needs a new category or one of them should be split.
 */
import type { Category } from "../types";

/** Compact repository line handed to the taxonomy agent. */
export interface AgentRepoLine {
  id: string;
  description: string | null;
  language: string | null;
  stars: number;
}

/** Repositories of the batch that fit none of the existing categories. */
export interface HomelessSignal {
  kind: "add";
  members: string[];
  meanSimilarity: number;
  nearestCategory: string | null;
  nearestSimilarity: number;
}

export interface SplitCluster {
  members: string[];
  intraSimilarity: number;
}

/** A category whose members drifted into two similarity clusters. */
export interface SplitSignal {
  kind: "split";
  category: string;
  memberCount: number;
  clusters: SplitCluster[];
  crossSimilarity: number;
  gap: number;
}

export type AgentSignal = HomelessSignal | SplitSignal;

export interface TaxonomyAgentPromptInput {
  categories: Category[];
  memberCounts: Map<string, number>;
  batchRepos: AgentRepoLine[];
  signals: AgentSignal[];
  maxCategories: number;
  maxDecisions: number;
  minMembers: number;
}

/**
 * Builds the taxonomy review prompt. Only called when the embedding pass
 * produced at least one signal, so every request has concrete evidence.
 */
export function buildTaxonomyAgentPrompt(
  input: TaxonomyAgentPromptInput,
): string {
  const { categories, memberCounts, batchRepos, signals } = input;

  const categoryList = categories
    .map((c) => `- ${c.name} (${memberCounts.get(c.name) ?? 0} repos): ${c.description}`)
    .join("\n");

  const repoList = batchRepos
    .map(
      (repo, i) => `${i + 1}. ${repo.id}
   Description: ${repo.description || "None"}
   Language: ${repo.language || "None"} | Stars: ${repo.stars}`,
    )
    .join("\n");

  const homeless = signals.filter(
    (signal): signal is HomelessSignal => signal.kind === "add",
  );
  const splits = signals.filter(
    (signal): signal is SplitSignal => signal.kind === "split",
  );

  const homelessList = homeless
    .map((signal) => {
      const nearest = signal.nearestCategory
        ? `best match "${signal.nearestCategory}" at ${signal.nearestSimilarity.toFixed(2)}`
        : "no category to compare against";
      return `- Group [${signal.members.length} repos, internal similarity ${signal.meanSimilarity.toFixed(2)}, ${nearest}]: ${signal.members.join(", ")}`;
    })
    .join("\n");

  const splitList = splits
    .map((signal) => {
      const clusters = signal.clusters
        .map(
          (cluster, index) =>
            `  cluster ${index + 1} [internal similarity ${cluster.intraSimilarity.toFixed(2)}, ${cluster.members.length} repos]: ${cluster.members.join(", ")}`,
        )
        .join("\n");
      return `- ${signal.category} (${signal.memberCount} repos, cross-cluster similarity ${signal.crossSimilarity.toFixed(2)}, gap ${signal.gap.toFixed(2)}):\n${clusters}`;
    })
    .join("\n");

  return `You are the taxonomy supervisor of a GitHub stars classifier. One batch of repositories has just been classified. Decide from the evidence below whether the taxonomy should change right now, or stay as it is.

## Current taxonomy (${categories.length} categories, member counts so far)
${categoryList}

## Batch just classified (${batchRepos.length} repositories)
${repoList}

## Evidence from the embedding model
Similarity is cosine similarity between repository vectors and category centroids (0 = unrelated, 1 = identical). Low similarity to every category means a repository fits nowhere; a large gap between the internal and the cross-cluster similarity means a category is really two categories.

### Repositories that fit no existing category
${homelessList || "- none"}

### Categories whose members split into two clusters
${splitList || "- none"}

## Rules
- Only change the taxonomy when the evidence is concrete. One weak signal is not enough.
- "add": create a new category for a group of repositories that fit nowhere. Use the group's members, at least ${input.minMembers} of them, and take the members from the group listing verbatim.
- "split": replace an existing category with 2-4 narrower categories. Every member of the original category must be listed in exactly one part, each part needs at least ${input.minMembers} members, and the new names should read as "<parent>-<detail>" (for example 游戏-Minecraft, 游戏-CSGO).
- Category names are short Chinese names. Use "-" to express hierarchy, never "/" or ":". Never create a category for a programming language (no Lang-Python, 语言-Rust, ...).
- Never reuse a name that already exists. Never exceed ${input.maxCategories} categories in total.
- Return at most ${input.maxDecisions} decisions. If the taxonomy is fine, answer with a single keep decision.

## Output format
Return ONLY a JSON object matching one of these shapes (no markdown fences, no commentary):
{"decisions":[{"action":"add","name":"<新分类名>","description":"<一句话说明>","members":["<owner/name>"],"reason":"<一句话理由>"}]}
{"decisions":[{"action":"split","category":"<现有分类名>","parts":[{"name":"<大类-小类>","description":"<一句话说明>","members":["<owner/name>"]}],"reason":"<一句话理由>"}]}
{"decisions":[{"action":"keep","reason":"<一句话理由>"}]}`;
}
