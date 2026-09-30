import { GoogleGenAI, Type } from "@google/genai";
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

/** Structured output schema for category planning */
const categorySchema = {
  type: Type.OBJECT,
  properties: {
    categories: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description:
              "Chinese category name (short, or 'A/B' / 'Major: Minor'; never a programming language)",
          },
          description: {
            type: Type.STRING,
            description: "Category description",
          },
        },
        required: ["name", "description"],
        propertyOrdering: ["name", "description"],
      },
    },
  },
  required: ["categories"],
};

/** Structured output schema for batch classification */
const batchClassifySchema = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description: "Repository ID (owner/name format)",
          },
          categories: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
            description: "Selected category names",
          },
        },
        required: ["id", "categories"],
        propertyOrdering: ["id", "categories"],
      },
    },
  },
  required: ["results"],
};

export class GeminiService implements AIService {
  readonly provider = "gemini";
  readonly model: string;

  private ai: GoogleGenAI;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.model = config.geminiModel;
    this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }

  /**
   * Plans categories based on the starred repositories
   */
  async planCategories(repos: RepoSummary[]): Promise<Category[]> {
    const prompt = buildCategoryPlannerPrompt(repos, this.config);

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        temperature: this.config.temperaturePlanning,
        maxOutputTokens: this.config.maxTokensPlanning,
        responseMimeType: "application/json",
        responseSchema: categorySchema,
      },
    });

    const text = response.text || "";

    if (this.config.logApiResponses) {
      console.log("\n[DEBUG] Gemini Planning Response:", text);
    }

    return parseCategoryPlanResponse(text, this.config);
  }

  /**
   * Classifies multiple repositories at once (batch)
   * Returns a map of repo id -> categories
   */
  async classifyRepositoriesBatch(
    repos: BatchRepoInfo[],
    categories: Category[],
  ): Promise<Map<string, string[]>> {
    const prompt = buildBatchClassifierPrompt(repos, categories, this.config);

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        temperature: this.config.temperatureClassify,
        maxOutputTokens: this.config.maxTokensClassify,
        responseMimeType: "application/json",
        responseSchema: batchClassifySchema,
      },
    });

    const text = response.text || "";

    if (this.config.logApiResponses) {
      console.log("\n[DEBUG] Gemini Classify Response:", text);
    }

    return parseBatchClassifierResponse(text, repos, categories, this.config);
  }

  /**
   * Asks the model to review the taxonomy mid-run (taxonomy agent).
   * Returns the raw JSON text; validation lives in taxonomy-agent.ts
   */
  async reviewTaxonomy(prompt: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: this.config.maxTokensClassify,
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "";

    if (this.config.logApiResponses) {
      console.log("\n[DEBUG] Gemini Taxonomy Review Response:", text);
    }

    return text;
  }
}
