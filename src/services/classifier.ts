/**
 * Classifies starred repositories and writes the result as flat Markdown files.
 *
 * Pipeline per batch:
 *   1. fetch the READMEs of the batch (extra signal for the model)
 *   2. ask the AI to map every repository to 1..N categories
 *   3. collect the assignments
 * Afterwards the whole assignment table is rendered to `<outputDir>/`.
 */
import ora from "ora";
import type { Config } from "../utils/config";
import { delay } from "../utils/rate-limiter";
import type { AIService } from "./ai";
import type { Category } from "../types";
import type { BatchRepoInfo } from "../prompts/classifier";
import type { Repo } from "../api/types";
import { fetchRepositoryReadme } from "../api";
import { buildRepoEntries, writeOutput, type WriteOutputResult } from "./markdown";

export interface ClassifyStats {
  success: number;
  failed: number;
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
 * Classifies repositories and writes `<outputDir>/README.md`
 * plus one README.md per category.
 */
export async function classifyAndWrite(
  config: Config,
  ai: AIService,
  options: ClassifyOptions,
): Promise<ClassifyStats> {
  const { repos, allRepos, categories, merge } = options;
  const batchSize = config.classifyBatchSize;
  const totalBatches = Math.ceil(repos.length / batchSize);

  console.log(
    `\n📂 Classifying ${repos.length} repositories in batches of ${batchSize}...\n`,
  );

  const assignments = new Map<string, string[]>();
  let success = 0;
  let failed = 0;

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, repos.length);
    const batchRepos = repos.slice(batchStart, batchEnd);

    console.log(`── Batch ${batchIdx + 1}/${totalBatches} (${batchStart + 1}-${batchEnd}) ──`);

    // Step 1: Fetch READMEs
    const batchRepoInfos = await fetchReadmesForBatch(config, batchRepos);

    // Step 2: AI classification
    const results = await classifyBatch(ai, batchRepoInfos, categories);
    if (!results) {
      failed += batchRepos.length;
      continue;
    }

    for (const repo of batchRepos) {
      const id = `${repo.owner.login}/${repo.name}`;
      const names = results.get(id) ?? [];

      if (names.length === 0) {
        failed++;
        console.log(`  ❌ ${id} (no category returned)`);
        continue;
      }

      assignments.set(id, names);
      success++;
      console.log(`  ✅ ${id} → ${names.slice(0, 2).join(", ")}`);
    }

    // Delay between batches
    if (batchIdx < totalBatches - 1) {
      await delay(config.batchDelay);
    }
  }

  console.log("\n📊 Results:");
  console.log(`  ✅ Classified: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);

  if (assignments.size === 0) {
    console.log("\n⚠️ Nothing to write - no repository could be classified.");
    return { success, failed, output: null };
  }

  // Step 3: Render the Markdown output
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

  console.log(`\n📁 Output: ${output.dir}`);
  console.log(`  - Categories: ${output.categories}`);
  console.log(`  - Repositories: ${output.repositories}`);
  if (output.removedFiles.length > 0) {
    console.log(`  - Removed stale files: ${output.removedFiles.join(", ")}`);
  }

  return { success, failed, output };
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
