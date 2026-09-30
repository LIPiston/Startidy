import type { Category, RepoSummary } from "../types";
import type { Config } from "../utils/config";
import { buildCategoryPlannerPrompt } from "../prompts/category-planner";
import {
  buildBatchClassifierPrompt,
  type BatchRepoInfo,
} from "../prompts/classifier";
import type { AIService } from "./ai";
import {
  parseBatchClassifierResponse,
  parseCategoryPlanResponse,
} from "./response-parser";

/** Minimal typed view of the OpenAI Chat Completions response */
interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  error?: { message?: string; type?: string; code?: string };
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatRequestOptions {
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  /** JSON Schema advertised to providers that support response_format=json_schema */
  schema?: { name: string; schema: Record<string, unknown> };
  label: string;
}

/** JSON Schemas (OpenAI structured-output flavor: every property is required) */
const CATEGORY_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    categories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            description:
              "Chinese category name (short, or 'A/B' / 'Major: Minor'; never a programming language)",
          },
          description: {
            type: "string",
            description: "Category description",
          },
        },
        required: ["name", "description"],
      },
    },
  },
  required: ["categories"],
};

const BATCH_CLASSIFY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "Repository ID (owner/name format)" },
          categories: {
            type: "array",
            items: { type: "string" },
            description: "Selected category names",
          },
        },
        required: ["id", "categories"],
      },
    },
  },
  required: ["results"],
};

/** 429 / 5xx / network errors are retried, everything else fails fast */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * AI service for any OpenAI-compatible Chat Completions endpoint
 * (OpenAI, DeepSeek, OpenRouter, Groq, Azure-compatible gateways,
 * Ollama, vLLM, LM Studio, ...).
 */
export class OpenAIService implements AIService {
  readonly provider = "openai-compatible";
  readonly model: string;

  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.model = config.openaiModel;

    if (!config.openaiApiKey) {
      throw new Error(
        "OpenAI-compatible provider selected but OPENAI_API_KEY is empty.",
      );
    }
  }

  private get endpoint(): string {
    return `${this.config.openaiBaseUrl}/chat/completions`;
  }

  async planCategories(repos: RepoSummary[]): Promise<Category[]> {
    const prompt = buildCategoryPlannerPrompt(repos, this.config);

    const text = await this.chatJson({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${prompt}

## Output format
Return ONLY a JSON object matching this shape (no markdown fences, no commentary):
{"categories":[{"name":"<分类名：中文短名，可用 'A/B' 或 '大类: 小类'，不要用编程语言>","description":"<一句话说明这个分类装什么>"}]}
Provide exactly ${this.config.maxCategories} categories.`,
        },
      ],
      temperature: this.config.temperaturePlanning,
      maxTokens: this.config.maxTokensPlanning,
      schema: { name: "category_plan", schema: CATEGORY_PLAN_JSON_SCHEMA },
      label: "Planning",
    });

    return parseCategoryPlanResponse(text, this.config);
  }

  async classifyRepositoriesBatch(
    repos: BatchRepoInfo[],
    categories: Category[],
  ): Promise<Map<string, string[]>> {
    const prompt = buildBatchClassifierPrompt(repos, categories, this.config);

    const text = await this.chatJson({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${prompt}

## Output format
Return ONLY a JSON object matching this shape (no markdown fences, no commentary):
{"results":[{"id":"<owner/name exactly as listed above>","categories":["<category name>"]}]}
Include every one of the ${repos.length} repositories exactly once, using the repository id verbatim.`,
        },
      ],
      temperature: this.config.temperatureClassify,
      maxTokens: this.config.maxTokensClassify,
      schema: { name: "batch_classification", schema: BATCH_CLASSIFY_JSON_SCHEMA },
      label: "Classification",
    });

    return parseBatchClassifierResponse(text, repos, categories, this.config);
  }

  /**
   * Sends one chat completion request and returns the assistant message text.
   * Retries transient failures with exponential backoff and degrades
   * gracefully when the endpoint rejects `response_format`.
   */
  private async chatJson(options: ChatRequestOptions): Promise<string> {
    const { messages, temperature, maxTokens, schema, label } = options;

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    switch (this.config.openaiResponseFormat) {
      case "json_object":
        body.response_format = { type: "json_object" };
        break;
      case "json_schema":
        if (schema) {
          body.response_format = {
            type: "json_schema",
            json_schema: {
              name: schema.name,
              strict: false,
              schema: schema.schema,
            },
          };
        }
        break;
      case "none":
        break;
    }

    let text = await this.requestWithRetry(body, label);

    if (text === null) {
      // The endpoint does not understand response_format: retry in plain mode
      delete body.response_format;
      console.warn(
        "⚠️  Provider rejected response_format. Retrying without JSON mode.",
      );
      text = await this.requestWithRetry(body, label);
    }

    if (this.config.logApiResponses) {
      console.log(`\n[DEBUG] OpenAI ${label} Response:`, text);
    }

    if (!text || text.trim() === "") {
      throw new Error(`AI provider returned an empty ${label.toLowerCase()} response`);
    }

    return text;
  }

  /**
   * Performs the HTTP call with retry. Returns `null` when the server
   * complains about the response format (so the caller can downgrade).
   */
  private async requestWithRetry(
    body: Record<string, unknown>,
    label: string,
  ): Promise<string | null> {
    const maxRetries = Math.max(0, this.config.maxRetries);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.config.openaiTimeoutMs),
        });

        if (!response.ok) {
          const errorText = await response.text();

          if (isResponseFormatError(response.status, errorText)) {
            return null;
          }

          if (!isRetryableStatus(response.status) || attempt === maxRetries) {
            throw new Error(
              `AI provider request failed (${response.status}): ${truncate(errorText)}`,
            );
          }

          const waitMs = retryAfterMs(response, attempt, this.config.retryDelay);
          console.error(
            `\n⚠️  ${label}: provider error ${response.status}. Retrying in ${(waitMs / 1000).toFixed(1)}s... (${attempt + 1}/${maxRetries})`,
          );
          await sleep(waitMs);
          continue;
        }

        const data = (await response.json()) as ChatCompletionResponse;

        if (data.error?.message) {
          throw new Error(`AI provider error: ${data.error.message}`);
        }

        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== "string") {
          throw new Error(
            "AI provider returned no message content. Check the model name and endpoint.",
          );
        }

        return content;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          const waitMs = Math.min(
            this.config.retryDelay * Math.pow(2, attempt),
            10000,
          );
          console.error(
            `\n⚠️  ${label}: ${lastError.message}. Retrying in ${(waitMs / 1000).toFixed(1)}s... (${attempt + 1}/${maxRetries})`,
          );
          await sleep(waitMs);
        }
      }
    }

    throw lastError || new Error("AI provider request failed after retries");
  }
}

const SYSTEM_PROMPT =
  "You are a precise assistant that organizes GitHub stars into categories. " +
  "Always answer with a single valid JSON object and nothing else.";

function truncate(text: string, max = 500): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/**
 * Detects "this endpoint does not support response_format/json_schema" errors.
 */
function isResponseFormatError(status: number, body: string): boolean {
  if (status !== 400 && status !== 404 && status !== 422) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes("response_format") ||
    lower.includes("json_schema") ||
    lower.includes("json mode")
  );
}

/**
 * Honours a Retry-After header when the provider sends one.
 */
function retryAfterMs(
  response: Response,
  attempt: number,
  baseDelayMs: number,
): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (!isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 60000);
    }
  }
  return Math.min(baseDelayMs * Math.pow(2, attempt), 10000);
}
