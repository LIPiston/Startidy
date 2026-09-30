/**
 * Bucket for repositories the AI could not map to any planned category.
 * They are written to their own Markdown file instead of being silently mixed
 * into the first category.
 */
export const UNCATEGORIZED_CATEGORY_NAME = "无法分类";

export interface Category {
  name: string;
  description: string;
  keywords: string[];
}

export interface CategoryPlan {
  categories: Category[];
}

export interface ClassificationResult {
  categories: string[];
  reason: string;
}

export interface RepoSummary {
  owner: string;
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
}

export interface RepoDetail extends RepoSummary {
  readme: string | null;
}
