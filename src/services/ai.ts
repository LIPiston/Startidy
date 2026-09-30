import type {
  Category,
  ClassificationResult,
  RepoDetail,
  RepoSummary,
} from "../types";
import type { BatchRepoInfo } from "../prompts/classifier";
import type { Config } from "../utils/config";
import { RateLimiter } from "../utils/rate-limiter";
import { GeminiService } from "./gemini";
import { OpenAIService } from "./openai";

export interface BatchClassificationResult {
  id: string;
  categories: string[];
}

/**
 * Provider-agnostic contract every AI backend must implement.
 * Keeping this small lets Gemini and any OpenAI-compatible endpoint be used
 * interchangeably by the commands and the classifier.
 */
export interface AIService {
  /** Human readable provider name, for logs */
  readonly provider: string;
  /** Model identifier being used, for logs */
  readonly model: string;

  /** Plans the category taxonomy from the starred repositories */
  planCategories(repos: RepoSummary[]): Promise<Category[]>;

  /** Classifies many repositories at once: repo id -> category names */
  classifyRepositoriesBatch(
    repos: BatchRepoInfo[],
    categories: Category[],
  ): Promise<Map<string, string[]>>;

  /** Classifies a single repository (fallback path) */
  classifyRepository(
    repo: RepoDetail,
    categories: Category[],
  ): Promise<ClassificationResult>;
}

/**
 * Builds the AI service for the configured provider.
 */
export function createAIService(config: Config): AIService {
  const service: AIService =
    config.aiProvider === "gemini"
      ? new GeminiService(config)
      : new OpenAIService(config);

  return config.aiRpm > 0 ? withRateLimit(service, config.aiRpm) : service;
}

/**
 * Spaces requests so at most `rpm` of them are issued per minute.
 * Provider agnostic: whichever backend is active honors `AI_RPM`.
 */
function withRateLimit(service: AIService, rpm: number): AIService {
  const limiter = new RateLimiter(Math.ceil(60000 / rpm));

  return {
    provider: service.provider,
    model: service.model,
    planCategories: (repos) =>
      limiter.throttle(() => service.planCategories(repos)),
    classifyRepositoriesBatch: (repos, categories) =>
      limiter.throttle(() => service.classifyRepositoriesBatch(repos, categories)),
    classifyRepository: (repo, categories) =>
      limiter.throttle(() => service.classifyRepository(repo, categories)),
  };
}
