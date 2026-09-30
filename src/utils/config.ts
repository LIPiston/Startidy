/**
 * Supported AI providers.
 * - gemini: Google Gemini via @google/genai
 * - openai: any OpenAI-compatible Chat Completions API (OpenAI, Azure OpenAI
 *   compatible gateways, DeepSeek, OpenRouter, Ollama, vLLM, LM Studio, ...)
 */
export type AIProvider = "gemini" | "openai";

/** How the OpenAI-compatible request should constrain the response format */
export type OpenAIResponseFormat = "json_object" | "json_schema" | "none";

export interface Config {
  // Required credentials
  githubToken: string;
  githubUsername: string;

  // AI provider selection
  aiProvider: AIProvider;

  // Gemini credentials/settings
  geminiApiKey: string;
  geminiModel: string;

  // OpenAI-compatible credentials/settings
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiResponseFormat: OpenAIResponseFormat;
  openaiTimeoutMs: number;

  // Category settings
  maxCategories: number; // Maximum number of categories (default: 32, GitHub limit)
  maxCategoriesPerRepo: number; // Maximum categories per repository (default: 3)
  minCategoriesPerRepo: number; // Minimum categories per repository (default: 1)

  // Batch processing settings
  classifyBatchSize: number; // AI classification batch size (default: 20)
  readmeBatchSize: number; // README fetch concurrent requests (default: 20)
  batchDelay: number; // Delay between batches in ms (default: 2000)

  // Rate limiting
  geminiRpm: number; // Gemini API requests per minute limit (default: 15)

  // AI model settings (provider agnostic)
  temperaturePlanning: number; // Category planning temperature (default: 0.7)
  temperatureClassify: number; // Classification temperature (default: 0.3)
  maxTokensPlanning: number; // Category planning max tokens
  maxTokensClassify: number; // Classification max tokens

  // README settings
  readmeMaxLength: number; // Maximum README length (default: 500, for batch)
  readmeMaxLengthSingle: number; // Maximum README length for single classification (default: 2000)

  // Markdown output settings
  outputDir: string; // Directory the Markdown files are written to (default: "stars")
  categoryNameMaxLength: number; // Maximum category name length (default: 20)

  // Retry settings
  maxRetries: number; // Maximum retry count (default: 3)
  retryDelay: number; // Delay between retries in ms (default: 1000)

  // Debug settings
  debug: boolean; // Debug mode (default: false)
  logApiResponses: boolean; // Log API responses (default: false)
}

function parseIntEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseFloatEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseBoolEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

/**
 * Reads the first environment variable that is set (ignoring empty strings).
 */
function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value.trim() !== "") return value.trim();
  }
  return undefined;
}

/**
 * Provider-agnostic number setting.
 * Prefers the generic `AI_*` variable, then the legacy provider specific one.
 */
function parseNumberSetting(
  genericKey: string,
  legacyKey: string,
  defaultValue: number,
  parser: (raw: string) => number,
): number {
  for (const key of [genericKey, legacyKey]) {
    const value = process.env[key];
    if (value === undefined || value.trim() === "") continue;
    const parsed = parser(value);
    if (!isNaN(parsed)) return parsed;
  }
  return defaultValue;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function resolveProvider(): AIProvider {
  const raw = (process.env.AI_PROVIDER || process.env.AI_BACKEND || "gemini")
    .trim()
    .toLowerCase();

  switch (raw) {
    case "gemini":
    case "google":
      return "gemini";
    case "openai":
    case "openai-compatible":
    case "compatible":
      return "openai";
    default:
      throw new Error(
        `Unsupported AI_PROVIDER "${raw}". Use "gemini" or "openai".`,
      );
  }
}

export function loadConfig(): Config {
  const githubToken = process.env.GITHUB_TOKEN;
  const githubUsername = process.env.GITHUB_USERNAME;

  if (!githubToken) {
    throw new Error(
      "GITHUB_TOKEN environment variable is required. Please check your .env file.",
    );
  }

  if (!githubUsername) {
    throw new Error(
      "GITHUB_USERNAME environment variable is required. Please check your .env file.",
    );
  }

  const aiProvider = resolveProvider();

  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const openaiApiKey =
    firstEnv("OPENAI_API_KEY", "OPENAI_COMPATIBLE_API_KEY") || "";

  if (aiProvider === "gemini" && !geminiApiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is required when AI_PROVIDER=gemini. " +
        "Set AI_PROVIDER=openai to use an OpenAI-compatible endpoint instead.",
    );
  }

  if (aiProvider === "openai" && !openaiApiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is required when AI_PROVIDER=openai. " +
        "Please check your .env file.",
    );
  }

  const openaiBaseUrl = normalizeBaseUrl(
    firstEnv("OPENAI_BASE_URL", "OPENAI_API_BASE") || "https://api.openai.com/v1",
  );

  const responseFormatRaw = (
    firstEnv("OPENAI_RESPONSE_FORMAT") || "json_object"
  ).toLowerCase();
  if (
    responseFormatRaw !== "json_object" &&
    responseFormatRaw !== "json_schema" &&
    responseFormatRaw !== "none"
  ) {
    throw new Error(
      `Unsupported OPENAI_RESPONSE_FORMAT "${responseFormatRaw}". Use "json_object", "json_schema" or "none".`,
    );
  }

  return {
    // Required credentials
    githubToken,
    githubUsername,

    // AI provider selection
    aiProvider,

    // Gemini credentials/settings
    geminiApiKey,
    geminiModel: firstEnv("GEMINI_MODEL") || "gemini-2.5-flash",

    // OpenAI-compatible credentials/settings
    openaiApiKey,
    openaiBaseUrl,
    openaiModel: firstEnv("OPENAI_MODEL", "AI_MODEL") || "gpt-4o-mini",
    openaiResponseFormat: responseFormatRaw,
    openaiTimeoutMs: parseIntEnv("OPENAI_TIMEOUT_MS", 120000),

    // Category settings
    maxCategories: parseIntEnv("MAX_CATEGORIES", 32),
    maxCategoriesPerRepo: parseIntEnv("MAX_CATEGORIES_PER_REPO", 3),
    minCategoriesPerRepo: parseIntEnv("MIN_CATEGORIES_PER_REPO", 1),

    // Batch processing settings
    classifyBatchSize: parseIntEnv("CLASSIFY_BATCH_SIZE", 20),
    readmeBatchSize: parseIntEnv("README_BATCH_SIZE", 20),
    batchDelay: parseIntEnv("BATCH_DELAY", 2000),

    // Rate limiting
    geminiRpm: parseIntEnv("GEMINI_RPM", 15),

    // AI model settings (AI_* wins, GEMINI_* kept for backwards compatibility)
    temperaturePlanning: parseNumberSetting(
      "AI_TEMPERATURE_PLANNING",
      "GEMINI_TEMPERATURE_PLANNING",
      0.7,
      parseFloat,
    ),
    temperatureClassify: parseNumberSetting(
      "AI_TEMPERATURE_CLASSIFY",
      "GEMINI_TEMPERATURE_CLASSIFY",
      0.3,
      parseFloat,
    ),
    maxTokensPlanning: parseNumberSetting(
      "AI_MAX_TOKENS_PLANNING",
      "GEMINI_MAX_TOKENS_PLANNING",
      aiProvider === "openai" ? 8192 : 65536,
      (raw) => parseInt(raw, 10),
    ),
    maxTokensClassify: parseNumberSetting(
      "AI_MAX_TOKENS_CLASSIFY",
      "GEMINI_MAX_TOKENS_CLASSIFY",
      aiProvider === "openai" ? 8192 : 65536,
      (raw) => parseInt(raw, 10),
    ),

    // README settings
    readmeMaxLength: parseIntEnv("README_MAX_LENGTH", 10000),
    readmeMaxLengthSingle: parseIntEnv("README_MAX_LENGTH_SINGLE", 10000),

    // Markdown output settings
    outputDir: firstEnv("OUTPUT_DIR", "STARS_DIR") || "stars",
    categoryNameMaxLength: parseIntEnv(
      firstEnv("CATEGORY_NAME_MAX_LENGTH") ? "CATEGORY_NAME_MAX_LENGTH" : "LIST_NAME_MAX_LENGTH",
      20,
    ),

    // Retry settings
    maxRetries: parseIntEnv("MAX_RETRIES", 3),
    retryDelay: parseIntEnv("RETRY_DELAY", 1000),

    // Debug settings
    debug: parseBoolEnv("DEBUG", false),
    logApiResponses: parseBoolEnv("LOG_API_RESPONSES", false),
  };
}

// Singleton config instance
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}
