import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import ora from "ora";
import { loadConfig } from "../utils/config";
import { loadPlan } from "../utils/plan-storage";
import { createAIService } from "../services/ai";
import { classifyAndWrite } from "../services/classifier";
import { clearOutput, readExistingOutput } from "../services/markdown";
import type { Category } from "../types";
import { fetchAllMyStarredRepos } from "../api";

export const classifyCommand = new Command("classify")
  .description("Classify Stars and write the Markdown category files")
  .option("--only-new", "Process only Stars missing from the Markdown output")
  .option("--use-existing", "Reuse the existing Markdown output as categories (no plan file needed)")
  .option("--reset", "Delete the generated Markdown output (undo)")
  .action(async (options) => {
    try {
      const config = loadConfig();

      // --reset: delete the generated Markdown output
      if (options.reset) {
        await handleReset(config.outputDir);
        return;
      }

      const ai = createAIService(config);

      console.log("\n📂 Starting Stars classification.\n");

      // Step 1: Load the existing output (reused for --only-new / --use-existing)
      const existing = readExistingOutput(config.outputDir);

      // Step 2: Determine categories
      let categories: Category[];

      if (options.useExisting) {
        if (existing.categories.length === 0) {
          console.log(`❌ No existing categories found in ${existing.dir}`);
          console.log("   Run 'startidy plan' first, or drop --use-existing.");
          return;
        }
        categories = existing.categories.map((c) => ({
          name: c.name,
          description: c.description,
          keywords: [],
        }));
        console.log(`📋 Using existing ${categories.length} categories from the Markdown output`);
      } else {
        const plan = loadPlan();
        if (!plan) {
          console.log("❌ No saved plan found.");
          console.log("   Run 'startidy plan' first, or use --use-existing.");
          return;
        }
        categories = plan.categories;
        console.log(`📋 Loaded ${categories.length} categories from plan`);
      }

      // Step 3: Fetch starred repos
      const repoSpinner = ora("Fetching starred repositories...").start();
      const result = await fetchAllMyStarredRepos(
        config.githubToken,
        config.githubUsername,
        (count) => {
          repoSpinner.text = `Fetching starred repositories... (${count})`;
        },
      );

      if (result.status !== 200 || !result.repos) {
        repoSpinner.fail("Failed to fetch starred repositories");
        throw new Error(`Failed to fetch starred repos: status ${result.status}`);
      }

      const allRepos = result.repos;
      repoSpinner.succeed(`Fetched ${allRepos.length} starred repositories.`);

      // Step 4: --only-new filtering
      let repos = allRepos;
      if (options.onlyNew) {
        repos = allRepos.filter(
          (repo) => !existing.repoIds.has(`${repo.owner.login}/${repo.name}`),
        );
        console.log(
          `  → ${allRepos.length - repos.length} already in the output, ${repos.length} to process`,
        );
      } else if (existing.categories.length > 0) {
        console.log(
          `\n⚠️ The existing output (${existing.categories.length} categories) will be replaced.`,
        );
        const confirmed = await confirm({
          message: `Overwrite ${existing.dir}?`,
          default: true,
        });
        if (!confirmed) {
          console.log("Cancelled.");
          return;
        }
      }

      if (repos.length === 0) {
        console.log("\n✅ No Stars to process.");
        return;
      }

      // Step 5: Classify and write Markdown
      await classifyAndWrite(config, ai, {
        repos,
        allRepos,
        categories,
        merge: Boolean(options.onlyNew),
      });

      console.log("\n✅ Classification complete!");
    } catch (error) {
      console.error("\n❌ Error:", (error as Error).message);
      process.exit(1);
    }
  });

async function handleReset(outputDir: string) {
  console.log("\n🔄 Deleting the generated Markdown output.\n");

  const confirmed = await confirm({
    message: `Delete startidy-generated files in "${outputDir}"?`,
    default: false,
  });

  if (!confirmed) {
    console.log("Cancelled.");
    return;
  }

  const removed = clearOutput(outputDir);

  if (removed.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  console.log(`\n✅ Removed ${removed.length} generated item(s):`);
  for (const item of removed) {
    console.log(`  - ${item}`);
  }
}
