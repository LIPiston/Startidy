import type {
  Category,
  ClassificationResult,
  RepoDetail,
  RepoSummary,
} from "../types";
import type { BatchRepoInfo } from "../prompts/classifier";
import type { Config } from "../utils/config";
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
  switch (config.aiProvider) {
    case "openai":
      return new OpenAIService(config);
    case "gemini":
    default:
      return new GeminiService(config);
  }
}
