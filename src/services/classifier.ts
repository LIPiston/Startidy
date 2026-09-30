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

/**
 * Classifies repositories and writes `<outputDir>/README.md` plus one Markdown
 * file per category. Progress is checkpointed after every batch.
 */
export async function classifyAndWrite(
  config: Config,
  ai: AIService,
  options: ClassifyOptions,
): Promise<ClassifyStats> {
  const { repos, allRepos, categories, merge } = options;
  const batchSize = config.classifyBatchSize;

  // ---- Resume from an interrupted run -------------------------------
  const saved = loadCheckpoint(config.outputDir);
  let resumeState: CheckpointState | null = null;

  if (saved) {
    if (sameCategories(saved.categories, categories)) {
      resumeState = saved;
    } else {
      console.log(
        "\n⚠️ Found an unfinished run with a different category set - ignoring it and starting over.",
      );
      clearCheckpoint(config.outputDir);
    }
  }

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
  const totalBatches = Math.ceil(pendingRepos.length / batchSize);
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

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, pendingRepos.length);
    const batchRepos = pendingRepos.slice(batchStart, batchEnd);

    console.log(`── Batch ${batchIdx + 1}/${totalBatches} (${batchStart + 1}-${batchEnd}) ──`);

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

        if (assignedNames.includes(UNCATEGORIZED_CATEGORY_NAME)) {
          uncategorized++;
          console.log(`  ⚠️  ${id} → ${UNCATEGORIZED_CATEGORY_NAME}`);
        } else {
          success++;
          console.log(`  ✅ ${id} → ${assignedNames.slice(0, 2).join(", ")}`);
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
      pendingIds: pendingRepos.slice(batchEnd).map(repoId),
      totalRepos: repos.length,
    });

    if (assignments.size > 0) {
      const partial = writePartial(config, categories, assignments, allRepos, merge);
      console.log(
        `  💾 Progress saved: ${assignments.size}/${repos.length} classified, ${partial.files.length} files written`,
      );
    }

    // Delay between batches
    if (batchIdx < totalBatches - 1) {
      await delay(config.batchDelay);
    }
  }

  console.log("\n📊 Results:");
  console.log(`  ✅ Classified: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);
  if (uncategorized > 0) {
    console.log(`  ⚠️  Uncategorized: ${uncategorized}`);
  }

  if (assignments.size === 0) {
    console.log("\n⚠️ Nothing to write - no repository could be classified.");
    clearCheckpoint(config.outputDir);
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
