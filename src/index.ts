#!/usr/bin/env node
import { config } from "dotenv";
import { Command } from "commander";
import { planCommand } from "./commands/plan";
import { classifyCommand } from "./commands/classify";
import { runCommand } from "./commands/run";
import { checkForUpdates } from "./utils/update-checker";

// Load .env file from current working directory
config();

// Check for updates in the background (non-blocking)
void checkForUpdates();

const program = new Command();

program
  .name("startidy")
  .description("AI-powered CLI tool to automatically organize your GitHub Stars into Markdown categories")
  .version("1.1.0")
  .option("--token <token>", "GitHub Personal Access Token")
  .option("--username <username>", "GitHub Username")
  .option("--ai-provider <provider>", "AI provider: openai (default) or gemini")
  .option("--gemini-key <key>", "Google Gemini API Key")
  .option("--openai-key <key>", "OpenAI-compatible API Key")
  .option("--openai-base-url <url>", "OpenAI-compatible base URL (default: https://api.openai.com/v1)")
  .option("--openai-model <model>", "OpenAI-compatible model name (default: gpt-4o-mini)")
  .option("--ai-model <model>", "Model name for the selected provider")
  .option("--max-categories <number>", "Maximum categories (default: 32)")
  .option("--batch-size <number>", "Batch size for classification (default: 20)")
  .option("--output-dir <dir>", "Output directory for the generated Markdown files (default: stars)")
  .option("--debug", "Enable debug mode")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();

    // Set environment variables from CLI options
    if (opts.token) process.env.GITHUB_TOKEN = opts.token;
    if (opts.username) process.env.GITHUB_USERNAME = opts.username;
    if (opts.aiProvider) process.env.AI_PROVIDER = opts.aiProvider;
    if (opts.geminiKey) process.env.GEMINI_API_KEY = opts.geminiKey;
    if (opts.openaiKey) process.env.OPENAI_API_KEY = opts.openaiKey;
    if (opts.openaiBaseUrl) process.env.OPENAI_BASE_URL = opts.openaiBaseUrl;
    if (opts.openaiModel) process.env.OPENAI_MODEL = opts.openaiModel;
    if (opts.aiModel) {
      // --ai-model targets whichever provider is in play
      const provider = (opts.aiProvider || process.env.AI_PROVIDER || "gemini")
        .toLowerCase();
      if (provider === "openai" || provider === "openai-compatible") {
        process.env.OPENAI_MODEL = opts.aiModel;
      } else {
        process.env.GEMINI_MODEL = opts.aiModel;
      }
    }
    if (opts.maxCategories) process.env.MAX_CATEGORIES = opts.maxCategories;
    if (opts.batchSize) process.env.CLASSIFY_BATCH_SIZE = opts.batchSize;
    if (opts.outputDir) process.env.OUTPUT_DIR = opts.outputDir;
    if (opts.debug) process.env.DEBUG = "true";
  });

// Individual step commands
program.addCommand(planCommand);        // plan - Plan categories
program.addCommand(classifyCommand);    // classify - Classify Stars and write Markdown

// Full auto execution
program.addCommand(runCommand);         // run - Full workflow

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
