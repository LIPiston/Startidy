import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import ora from "ora";
import { loadConfig, type Config } from "../utils/config";
import { createAIService, type AIService } from "../services/ai";
import { classifyAndWrite } from "../services/classifier";
import { categoryFileName, readExistingOutput } from "../services/markdown";
import type { Category, RepoSummary } from "../types";
import { fetchAllMyStarredRepos, type Repo } from "../api";

export const runCommand = new Command("run")
  .description("Run the full workflow automatically (plan → classify → write Markdown)")
  .option("--only-new", "Process only Stars missing from the Markdown output (keep existing files)")
  .option("--dry-run", "Simulation mode (only preview category planning)")
  .action(async (options) => {
    try {
      const config = loadConfig();
      const ai = createAIService(config);

      if (config.debug) {
        console.log("\n[DEBUG] Config:", {
          maxCategories: config.maxCategories,
          classifyBatchSize: config.classifyBatchSize,
          outputDir: config.outputDir,
          aiProvider: config.aiProvider,
          aiModel: ai.model,
        });
      }

      console.log("\n🚀 Starting GitHub Stars auto-organization.\n");

      // Step 1: Fetch starred repos
      const allRepos = await fetchStarredRepos(config);
      if (allRepos.length === 0) {
        console.log("No starred repositories found.");
        return;
      }

      // Step 2: Inspect the existing Markdown output
      const existing = readExistingOutput(config.outputDir);

      let repos: Repo[] = allRepos;
      let categories: Category[];

      if (options.onlyNew) {
        repos = allRepos.filter(
          (repo) => !existing.repoIds.has(`${repo.owner.login}/${repo.name}`),
        );

        if (repos.length === 0) {
          console.log("\n✅ All Stars are already in the Markdown output.");
          return;
        }

        if (existing.categories.length === 0) {
          console.log(
            `\n⚠️ No existing categories in ${existing.dir}. Run again without --only-new.`,
          );
          return;
        }

        categories = existing.categories.map((c) => ({
          name: c.name,
          description: c.description,
          keywords: [],
        }));
        console.log(
          `\n📋 ${repos.length} new Star(s); reusing ${categories.length} existing categories`,
        );
      } else {
        categories = await planCategories(ai, allRepos, config);
      }

      // Step 3: Exit here for dry run
      if (options.dryRun) {
        displayDryRunResults(categories, config, repos.length, existing);
        return;
      }

      // Step 4: Confirm replacing existing output
      if (!options.onlyNew && existing.categories.length > 0) {
        const shouldOverwrite = await confirm({
          message: `Overwrite the existing Markdown output in ${existing.dir}?`,
          default: true,
        });
        if (!shouldOverwrite) {
          console.log("Cancelled.");
          process.exit(0);
        }
      }

      // Step 5: Classify and write Markdown
      await classifyAndWrite(config, ai, {
        repos,
        allRepos,
        categories,
        merge: Boolean(options.onlyNew),
      });

      console.log("\n✅ Done! Stars have been organized into Markdown categories.");
    } catch (error) {
      console.error("\n❌ Error:", (error as Error).message);
      process.exit(1);
    }
  });

// ============================================
// Helper Functions
// ============================================

async function fetchStarredRepos(config: Config): Promise<Repo[]> {
  const spinner = ora("Fetching starred repositories...").start();

  const result = await fetchAllMyStarredRepos(
    config.githubToken,
    config.githubUsername,
    (count) => {
      spinner.text = `Fetching starred repositories... (${count})`;
    },
  );

  if (result.status !== 200 || !result.repos) {
    spinner.fail("Failed to fetch starred repositories");
    throw new Error(`Failed to fetch starred repos: status ${result.status}`);
  }

  spinner.succeed(`Fetched ${result.repos.length} starred repositories.`);
  return result.repos;
}

async function planCategories(
  ai: AIService,
  repos: Repo[],
  config: Config,
): Promise<Category[]> {
  const spinner = ora(`AI is planning ${config.maxCategories} categories...`).start();

  const repoSummaries: RepoSummary[] = repos.map((r) => ({
    owner: r.owner.login,
    name: r.name,
    description: r.description,
    language: r.language,
    stars: r.stargazers_count,
  }));

  try {
    const categories = await ai.planCategories(repoSummaries);
    spinner.succeed(`${categories.length} categories have been planned.`);
    return categories;
  } catch (error) {
    spinner.fail("Failed to plan categories");
    throw error;
  }
}

function displayDryRunResults(
  categories: Category[],
  config: Config,
  repoCount: number,
  existing: { dir: string; categories: unknown[] },
) {
  console.log("\n📋 [Dry Run] Planned Categories:\n");
  console.log("─".repeat(60));

  categories.forEach((c, i) => {
    console.log(`${(i + 1).toString().padStart(2)}. ${c.name}`);
    console.log(`    → ${categoryFileName(c.name)}`);
    if (c.description) {
      console.log(`    ${c.description}`);
    }
  });

  console.log("─".repeat(60));
  console.log("\n📊 Summary:");
  console.log(`  - Categories: ${categories.length}`);
  console.log(`  - Target repositories: ${repoCount}`);
  console.log(`  - Batch size: ${config.classifyBatchSize}`);
  console.log(`  - Output directory: ${existing.dir}`);
  console.log(`  - Existing categories on disk: ${existing.categories.length}`);
  console.log(`  - AI provider: ${config.aiProvider}`);
  console.log(
    `  - AI model: ${config.aiProvider === "openai" ? config.openaiModel : config.geminiModel}`,
  );
  console.log("\n(Dry run mode - no actual execution.)");
}
