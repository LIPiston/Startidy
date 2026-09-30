/**
 * Classifies starred repositories and writes the result as flat Markdown files.
 *
 * Pipeline per batch:
 *   1. fetch the READMEs of the batch (extra signal for the model)
 *   2. ask the AI to map every repository to 1..N categories
 *   3. collect the assignments, write the Markdown output and refresh the
 *      progress file, so an interrupted run can resume where it stopped
 *
 * Afterwards the whole assignment table is rendered to `<outputDir>/`.
 */
import ora from "ora";
import { createHash } from "crypto";
import type { Config } from "../utils/config";
import { delay } from "../utils/rate-limiter";
import type { AIService } from "./ai";
import type { Category } from "../types";
import { UNCATEGORIZED_CATEGORY_NAME } from "../types";
import type { BatchRepoInfo } from "../prompts/classifier";
import type { Repo } from "../api/types";
import { fetchRepositoryReadme } from "../api";
import { buildRepoEntries, writeOutput, type WriteOutputResult } from "./markdown";
import {
  CHECKPOINT_VERSION,
  clearCheckpoint,
  loadCheckpoint,
  sameCategories,
  saveCheckpoint,
  type CheckpointState,
} from "./checkpoint";
import {
  createEmbeddingClient,
  isEmbeddingConfigured,
  type EmbeddingClient,
} from "./embeddings";
import {
  reviewTaxonomy,
  type AgentChange,
  type AgentRepo,
  type TaxonomyReview,
} from "./taxonomy-agent";

export interface ClassifyStats {
  success: number;
  failed: number;
  /** Repositories written to the uncategorized bucket */
  uncategorized: number;
  output: WriteOutputResult | null;
}

export interface ClassifyOptions {
  /** Repositories to classify in this run */
  repos: Repo[];
  /** Every starred repository - metadata source for rendering */
  allRepos: Repo[];
  categories: Category[];
  /** Merge into existing files instead of replacing the output */
  merge: boolean;
}

/** How often a single repository may be pushed back into the queue */
const REQUEUE_LIMIT_PER_REPO = 2;

/**
 * Classifies repositories and writes `<outputDir>/README.md` plus one Markdown
 * file per category. Progress is checkpointed after every batch, and the
 * taxonomy agent may add or split categories between batches - repositories
 * affected by its decisions go back into the queue for re-classification.
 */
export async function classifyAndWrite(
  config: Config,
  ai: AIService,
  options: ClassifyOptions,
): Promise<ClassifyStats> {
  const { repos, allRepos, merge } = options;
  const batchSize = config.classifyBatchSize;
  const runIdentity = createRunIdentity(repos, options.categories);

  // ---- Resume from an interrupted run -------------------------------
  const saved = loadCheckpoint(config.outputDir);
  let resumeState: CheckpointState | null = null;

  if (saved) {
    // A taxonomy the agent changed mid-run is newer than the plan, so it
    // always wins. Otherwise the plan has to match the checkpoint.
    if (
      saved.runIdentity === runIdentity &&
      saved.totalRepos === repos.length &&
      (saved.agentModifiedCategories || sameCategories(saved.categories, options.categories))
    ) {
      resumeState = saved;
    } else {
      console.log(
        "\n⚠️ Found an unfinished run with a different category set - ignoring it and starting over.",
      );
      clearCheckpoint(config.outputDir);
    }
  }

  /** Working taxonomy - the agent may add to or split it mid-run */
  let categories = resumeState
    ? [...resumeState.categories]
    : [...options.categories];
  let agentTouched = resumeState?.agentModifiedCategories === true;

  const assignments = new Map<string, string[]>(
    resumeState ? Object.entries(resumeState.assignments) : [],
  );

  let success = 0;
  let uncategorized = 0;
  for (const names of assignments.values()) {
    if (names.includes(UNCATEGORIZED_CATEGORY_NAME)) uncategorized++;
    else success++;
  }
  let failed = 0;

  const pendingRepos = resumeState
    ? repos.filter((repo) => !assignments.has(repoId(repo)))
    : repos;
  const failedIds = new Set<string>();

  if (resumeState) {
    console.log(
      `\n⏩ Resuming from ${config.outputDir}: ${assignments.size}/${repos.length} repositories already done, ${pendingRepos.length} left.`,
    );
  }

  if (pendingRepos.length > 0) {
    console.log(
      `\n📂 Classifying ${pendingRepos.length} repositories in batches of ${batchSize}...\n`,
    );
  }

  // ---- Taxonomy agent setup -----------------------------------------
  const embeddings =
    config.agentEnabled && isEmbeddingConfigured(config)
      ? createEmbeddingClient(config)
      : null;

  if (embeddings) {
    console.log(
      `  🤖 Taxonomy agent active (${embeddings.provider}/${embeddings.model})`,
    );
  } else if (config.agentEnabled) {
    console.log(
      "  ℹ️ Taxonomy agent off: set EMBEDDING_MODEL (plus EMBEDDING_API_KEY for a separate endpoint) so it can review the taxonomy.",
    );
  }

  const repoInfo = new Map<string, AgentRepo>(
    allRepos.map((repo) => [
      repoId(repo),
      {
        id: repoId(repo),
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count,
      },
    ]),
  );
  const reposById = new Map<string, Repo>(
    allRepos.map((repo) => [repoId(repo), repo]),
  );
  const vectorCache = new Map<string, number[]>();
  const requeueCounts = new Map<string, number>(
    resumeState ? Object.entries(resumeState.requeueCounts) : [],
  );

  // ---- Work queue: the agent can push repositories back in -------------
  const queue: Repo[] = [...pendingRepos];
  const maxBatches = Math.ceil(pendingRepos.length / batchSize) * 3 + 3;
  let batchIdx = 0;

  while (queue.length > 0 && batchIdx < maxBatches) {
    const batchRepos = queue.splice(0, batchSize);
    batchIdx++;

    console.log(
      `── Batch ${batchIdx} (${batchRepos.length} repositories, ${queue.length} still queued) ──`,
    );

    // Step 1: Fetch READMEs
    const batchRepoInfos = await fetchReadmesForBatch(config, batchRepos);

    // Step 2: AI classification
    const results = await classifyBatch(ai, batchRepoInfos, categories);
    if (!results) {
      failed += batchRepos.length;
      for (const repo of batchRepos) failedIds.add(repoId(repo));
    } else {
      for (const repo of batchRepos) {
        const id = repoId(repo);
        const names = results.get(id) ?? [];
        const assignedNames =
          names.length > 0 ? names : [UNCATEGORIZED_CATEGORY_NAME];

        assignments.set(id, assignedNames);
        failedIds.delete(id);

        if (assignedNames.includes(UNCATEGORIZED_CATEGORY_NAME)) {
          uncategorized++;
          console.log(`  ⚠️  ${id} → ${UNCATEGORIZED_CATEGORY_NAME}`);
        } else {
          success++;
          console.log(`  ✅ ${id} → ${assignedNames.slice(0, 2).join(", ")}`);
        }
      }

      // Step 2b: let the taxonomy agent review the fresh assignments
      if (embeddings) {
        const review = await runTaxonomyAgent({
          config,
          ai,
          embeddings,
          categories,
          assignments,
          batchRepoInfos,
          repoInfo,
          vectorCache,
        });

        if (review) {
          categories = review.categories;
          agentTouched = true;

          // Repositories the agent moved are classified again against the
          // new taxonomy, so their old assignment is dropped first.
          const requeued: Repo[] = [];
          for (const id of review.requeue) {
            const times = requeueCounts.get(id) ?? 0;
            if (times >= REQUEUE_LIMIT_PER_REPO) continue;

            const names = assignments.get(id);
            if (!names) continue;

            if (names.includes(UNCATEGORIZED_CATEGORY_NAME)) uncategorized--;
            else success--;

            assignments.delete(id);
            failedIds.delete(id);
            requeueCounts.set(id, times + 1);

            const repo = reposById.get(id);
            if (repo) requeued.push(repo);
          }

          for (const change of review.changes) {
            console.log(`  🤖 ${describeChange(change)}`);
          }
          if (requeued.length > 0) {
            queue.push(...requeued);
            console.log(
              `  🔁 ${requeued.length} repositories queued for re-classification`,
            );
          }
        }
      }
    }

    // Step 3: Persist progress + write what we have so far
    saveCheckpoint(config.outputDir, {
      version: CHECKPOINT_VERSION,
      updatedAt: new Date().toISOString(),
      categories,
      assignments: Object.fromEntries(assignments),
      failedIds: [...failedIds],
      pendingIds: queue.map(repoId),
      totalRepos: repos.length,
      runIdentity,
      requeueCounts: Object.fromEntries(requeueCounts),
      agentModifiedCategories: agentTouched,
    });

    if (assignments.size > 0) {
      const partial = writePartial(config, categories, assignments, allRepos, merge);
      console.log(
        `  💾 Progress saved: ${assignments.size}/${repos.length} classified, ${partial.files.length} files written`,
      );
    }

    // Delay between batches
    if (queue.length > 0) {
      await delay(config.batchDelay);
    }
  }

  const incomplete = queue.length > 0;
  if (incomplete) {
    failed += queue.length;
    for (const repo of queue) failedIds.add(repoId(repo));
    saveCheckpoint(config.outputDir, {
      version: CHECKPOINT_VERSION,
      updatedAt: new Date().toISOString(),
      categories,
      assignments: Object.fromEntries(assignments),
      failedIds: [...failedIds],
      pendingIds: queue.map(repoId),
      totalRepos: repos.length,
      runIdentity,
      requeueCounts: Object.fromEntries(requeueCounts),
      agentModifiedCategories: agentTouched,
    });
    console.log(`\n⚠️ Batch limit reached with ${queue.length} repositories still queued; checkpoint retained.`);
  }

  console.log("\n📊 Results:");
  console.log(`  ✅ Classified: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);
  if (uncategorized > 0) {
    console.log(`  ⚠️  Uncategorized: ${uncategorized}`);
  }

  if (assignments.size === 0) {
    console.log("\n⚠️ Nothing to write - no repository could be classified.");
    if (!incomplete && failed === 0) clearCheckpoint(config.outputDir);
    return { success, failed, uncategorized, output: null };
  }

  if (failed > 0) {
    console.log(
      "  ℹ️ Failed repositories keep their checkpoint and are retried on the next run.",
    );
  }

  // Step 4: Render the final Markdown output
  const writeSpinner = ora("Writing Markdown...").start();
  const output = writeOutput({
    outputDir: config.outputDir,
    categories,
    assignments,
    repos: buildRepoEntries(allRepos),
    merge,
    username: config.githubUsername,
  });
  writeSpinner.succeed(`Markdown written (${output.files.length} files)`);

  // A failed batch keeps the checkpoint so the next run only retries those repositories.
  if (failed === 0) {
    clearCheckpoint(config.outputDir);
  }

  console.log(`\n📁 Output: ${output.dir}`);
  console.log(`  - Categories: ${output.categories}`);
  console.log(`  - Repositories: ${output.repositories}`);
  if (output.removedFiles.length > 0) {
    console.log(`  - Removed stale files: ${output.removedFiles.join(", ")}`);
  }

  return { success, failed, uncategorized, output };
}

function repoId(repo: Repo): string {
  return `${repo.owner.login}/${repo.name}`;
}

function createRunIdentity(repos: Repo[], categories: Category[]): string {
  const payload = JSON.stringify({
    repos: repos.map(repoId).sort(),
    categories: categories.map((category) => ({
      name: category.name,
      description: category.description,
      keywords: category.keywords,
    })),
  });
  return createHash("sha256").update(payload).digest("hex");
}

interface AgentRunInput {
  config: Config;
  ai: AIService;
  embeddings: EmbeddingClient;
  categories: Category[];
  assignments: Map<string, string[]>;
  batchRepoInfos: BatchRepoInfo[];
  repoInfo: Map<string, AgentRepo>;
  vectorCache: Map<string, number[]>;
}

/**
 * Runs the taxonomy agent after a batch. A failing embedding endpoint or
 * model call only skips the review for this batch - the run continues.
 */
async function runTaxonomyAgent(
  input: AgentRunInput,
): Promise<TaxonomyReview | null> {
  const spinner = ora("Taxonomy agent reviewing...").start();

  try {
    const review = await reviewTaxonomy({
      config: input.config,
      ai: input.ai,
      embeddings: input.embeddings,
      categories: input.categories,
      assignments: input.assignments,
      batchRepos: input.batchRepoInfos.map((info) => ({
        id: info.id,
        description: info.description,
        language: info.language,
        stars: info.stars,
      })),
      repoInfo: input.repoInfo,
      vectorCache: input.vectorCache,
    });

    if (review) spinner.succeed("Taxonomy agent: taxonomy updated");
    else spinner.stop();

    return review;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.warn(`Taxonomy agent skipped this batch: ${message}`);
    return null;
  }
}

/** One-line description of an applied agent decision, for the run log. */
function describeChange(change: AgentChange): string {
  if (change.action === "add") {
    return `added 「${change.added.name}」 for ${change.members.length} repositories - ${change.reason}`;
  }
  const parts = change.parts.map((part) => `「${part.name}」`).join(", ");
  return `split 「${change.removed.name}」 into ${parts} (${change.members.length} repositories) - ${change.reason}`;
}

/** Renders the assignment table collected so far (used after every batch). */
function writePartial(
  config: Config,
  categories: Category[],
  assignments: Map<string, string[]>,
  allRepos: Repo[],
  merge: boolean,
): WriteOutputResult {
  return writeOutput({
    outputDir: config.outputDir,
    categories,
    assignments,
    repos: buildRepoEntries(allRepos),
    merge,
    username: config.githubUsername,
  });
}

async function fetchReadmesForBatch(
  config: Config,
  batchRepos: Repo[],
): Promise<BatchRepoInfo[]> {
  const spinner = ora(`Fetching README... (0/${batchRepos.length})`).start();
  let readmeCount = 0;

  const batchRepoInfos: BatchRepoInfo[] = await Promise.all(
    batchRepos.map(async (repo) => {
      const readme = await fetchRepositoryReadme(
        config.githubToken,
        repo.owner.login,
        repo.name,
      );
      readmeCount++;
      spinner.text = `Fetching README... (${readmeCount}/${batchRepos.length})`;
      return {
        id: `${repo.owner.login}/${repo.name}`,
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count,
        readme,
      };
    }),
  );

  spinner.succeed(`README fetched (${batchRepos.length})`);
  return batchRepoInfos;
}

async function classifyBatch(
  ai: AIService,
  batchRepoInfos: BatchRepoInfo[],
  categories: Category[],
): Promise<Map<string, string[]> | null> {
  const spinner = ora("AI classifying...").start();

  try {
    const results = await ai.classifyRepositoriesBatch(batchRepoInfos, categories);
    spinner.succeed("Classification complete");
    return results;
  } catch (error) {
    spinner.fail("Classification failed");
    return null;
  }
}
