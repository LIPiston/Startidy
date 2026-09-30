import type { Category } from "../types";
import { UNCATEGORIZED_CATEGORY_NAME } from "../types";
import type { Config } from "../utils/config";
import type { BatchRepoInfo } from "../prompts/classifier";

/**
 * Strips markdown code fences and surrounding prose from a model response,
 * returning the most likely JSON payload.
 */
export function extractJsonPayload(text: string): string {
  let jsonStr = text.trim();

  // Many models wrap JSON in ```json ... ``` fences
  const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    jsonStr = fenced[1].trim();
  }

  if (jsonStr.startsWith("{") || jsonStr.startsWith("[")) {
    return jsonStr;
  }

  // Fall back to the first balanced-looking object in the text
  const start = jsonStr.indexOf("{");
  const end = jsonStr.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return jsonStr.slice(start, end + 1);
  }

  return jsonStr;
}

/**
 * Best-effort repair of JSON that was cut off by an output token limit.
 */
function repairTruncatedJson(jsonStr: string): string {
  if (jsonStr.endsWith("}")) return jsonStr;

  const openBraces = (jsonStr.match(/\{/g) || []).length;
  const closeBraces = (jsonStr.match(/\}/g) || []).length;
  const openBrackets = (jsonStr.match(/\[/g) || []).length;
  const closeBrackets = (jsonStr.match(/\]/g) || []).length;

  // Remove incomplete part after the last complete object
  const lastCompleteIdx = jsonStr.lastIndexOf("}");
  if (lastCompleteIdx > 0) {
    const afterLast = jsonStr.slice(lastCompleteIdx + 1);
    if (afterLast.includes("{") && !afterLast.includes("}")) {
      jsonStr = jsonStr.slice(0, lastCompleteIdx + 1);
    }
  }

  // Add missing brackets
  jsonStr += "]".repeat(Math.max(0, openBrackets - closeBrackets));
  jsonStr += "}".repeat(Math.max(0, openBraces - closeBraces));

  return jsonStr;
}

/**
 * Major keys that describe a programming language rather than a domain.
 */
const LANGUAGE_MAJOR_RE =
  /^(lang|langs|language|languages|prog\.?\s*lang|programming\s*languages?|pl|语言|語言|编程语言|程式語言|开发语言|程序语言|语言类)$/i;

/**
 * Generic "code" majors: when their minor is nothing but language names,
 * the category is still a language axis.
 */
const GENERIC_CODE_MAJOR_RE =
  /^(tech|tech\s*stack|dev|development|code|coding|programming|stack|lib|libraries|library|framework|frameworks|sdk|tool|tools|software|技术栈|开发|编程|代码|框架|库|工具|软件)$/i;

/** Language/format names that must never be used as a category axis. */
const LANGUAGE_NAMES = new Set([
  "python", "py", "javascript", "js", "typescript", "ts", "js & ts", "js/ts",
  "node", "nodejs", "node.js", "deno", "bun",
  "java", "kotlin", "scala", "groovy", "clojure", "go", "golang", "rust",
  "c", "c++", "cpp", "c#", "csharp", "f#", "fsharp", "objective-c", "objc",
  "swift", "ruby", "php", "perl", "lua", "r", "dart", "flutter", "elixir",
  "erlang", "haskell", "ocaml", "lisp", "scheme", "julia", "matlab",
  "fortran", "cobol", "assembly", "asm", "shell", "bash", "zsh", "fish",
  "powershell", "sql", "html", "css", "scss", "sass", "vue", "svelte",
  "solidity", "zig", "nim", "crystal", "gdscript", "jupyter", "jupyter notebook",
  "notebook", "webassembly", "wasm", "prolog", "ada", "delphi", "pascal",
  "visual basic", "vb", "vb.net", "vba", "abap", "apex", "latex", "markdown",
  "raku", "perl6", "smalltalk",
]);

/**
 * Names above that are also common domain buckets ("obsidian 笔记", "shell 脚本",
 * "网页/HTML 主题"), so a category made only of these is kept.
 */
const DOMAINISH_LANGUAGE_NAMES = new Set([
  "html", "css", "scss", "sass", "sql", "markdown", "latex",
  "jupyter", "jupyter notebook", "notebook", "webassembly", "wasm",
  "shell", "bash", "zsh", "fish", "powershell",
  "vue", "svelte", "node", "nodejs", "node.js", "deno", "bun",
  "flutter", "rails",
]);

/** Trailing words that do not change what a category is about. */
const LANGUAGE_SUFFIX_RE = /(相关|系列|分类|方面|资源|工具|开发|项目)$/;

function stripLanguageSuffix(part: string): string {
  return part.trim().replace(LANGUAGE_SUFFIX_RE, "").trim();
}

/** Splits a category name into comparable pieces ("Tech: JS & TS" -> tech, js, ts). */
function toTokens(text: string): string[] {
  return text
    .split(/[:\/,&+·]|\band\b/i)
    .map((part) => stripLanguageSuffix(part).toLowerCase())
    .filter(Boolean);
}

function isLanguageToken(token: string): boolean {
  return LANGUAGE_NAMES.has(token) && !DOMAINISH_LANGUAGE_NAMES.has(token);
}

/**
 * Detects a category that groups repositories by programming language
 * (e.g. "Lang: Python", "语言: Go", "Tech: JS & TS", "Python", "Python/Go").
 */
export function isLanguageCategory(name: string): boolean {
  const segments = name
    .split(/[:\/]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  // "Lang: Python", "语言: Go", "Language/ETC", "Lang"
  if (
    segments.length > 0 &&
    LANGUAGE_MAJOR_RE.test(stripLanguageSuffix(segments[0]).toLowerCase())
  ) {
    return true;
  }

  // "Tech: JS & TS", "技术栈: Python & Go"
  const minorTokens = toTokens(segments.slice(1).join(" "));
  if (
    minorTokens.length > 0 &&
    GENERIC_CODE_MAJOR_RE.test(stripLanguageSuffix(segments[0] ?? "").toLowerCase()) &&
    minorTokens.every(isLanguageToken)
  ) {
    return true;
  }

  // Nothing but language names: "Python", "JS & TS", "Python/Go"
  const allTokens = toTokens(name);
  return allTokens.length > 0 && allTokens.every(isLanguageToken);
}

/**
 * Removes language-based categories from a plan. If the model returned nothing
 * but language categories, the original list is kept so classification still
 * has something to work with.
 */
export function filterLanguageCategories(categories: Category[]): {
  kept: Category[];
  dropped: Category[];
} {
  const dropped = categories.filter((c) => isLanguageCategory(c.name));
  if (dropped.length === 0) return { kept: categories, dropped };

  const kept = categories.filter((c) => !isLanguageCategory(c.name));
  return kept.length > 0 ? { kept, dropped } : { kept: categories, dropped: [] };
}

/**
 * Parses a structured category plan response.
 */
export function parseCategoryPlanResponse(text: string, config: Config): Category[] {
  try {
    const parsed = JSON.parse(repairTruncatedJson(extractJsonPayload(text)));
    const rawCategories = Array.isArray(parsed) ? parsed : parsed?.categories;

    if (!Array.isArray(rawCategories)) {
      throw new Error("Invalid response structure: missing 'categories' array");
    }

    const categories: Category[] = rawCategories.map(
      (c: { name?: string; description?: string }) => ({
        name: c?.name || "Unnamed",
        description: c?.description || "",
        keywords: [],
      }),
    );

    const { kept, dropped } = filterLanguageCategories(categories);
    if (dropped.length > 0) {
      console.warn(
        `Warning: Dropped ${dropped.length} language-based category(ies) - repositories are grouped by domain, not language: ${dropped
          .map((c) => c.name)
          .join(", ")}`,
      );
    }

    if (kept.length !== config.maxCategories) {
      console.warn(
        `Warning: Expected ${config.maxCategories} categories, got ${kept.length}`,
      );
    }

    return kept;
  } catch (error) {
    console.error("Failed to parse category response:", error);
    if (config.debug) {
      console.error("Raw response:", text);
    }
    throw new Error("Failed to parse AI category response");
  }
}

/**
 * Parses a batch classification response into a repo id -> categories map.
 * Never throws: repositories the model did not place (unknown name, missing
 * entry, unparseable output) fall back to the uncategorized bucket.
 */
export function parseBatchClassifierResponse(
  text: string,
  repos: BatchRepoInfo[],
  categories: Category[],
  config: Config,
): Map<string, string[]> {
  const resultMap = new Map<string, string[]>();
  const validCategoryNames = new Set(categories.map((c) => c.name));
  const fallbackCategory = UNCATEGORIZED_CATEGORY_NAME;

  try {
    const parsed = JSON.parse(repairTruncatedJson(extractJsonPayload(text)));

    if (!parsed.results || !Array.isArray(parsed.results)) {
      throw new Error("Invalid response structure");
    }

    for (const result of parsed.results) {
      if (!result.id || !Array.isArray(result.categories)) continue;

      const validCategories = result.categories
        .filter((c: string) => validCategoryNames.has(c))
        .slice(0, config.maxCategoriesPerRepo);

      resultMap.set(
        result.id,
        validCategories.length > 0 ? validCategories : [fallbackCategory],
      );
    }

    // Repos not in response get the fallback bucket
    for (const repo of repos) {
      if (!resultMap.has(repo.id)) {
        resultMap.set(repo.id, [fallbackCategory]);
      }
    }
  } catch (error) {
    console.error("Failed to parse batch classifier response:", error);
    if (config.debug) {
      console.error("Raw response:", text);
    }

    // Fallback: try to extract individual patterns
    const linePattern = /"id"\s*:\s*"([^"]+)"[^}]*"categories"\s*:\s*\[([^\]]*)\]/g;
    let match;
    while ((match = linePattern.exec(text)) !== null) {
      const id = match[1];
      const categoriesStr = match[2];
      const cats = categoriesStr
        .split(",")
        .map((s) => s.trim().replace(/"/g, ""))
        .filter((c) => validCategoryNames.has(c))
        .slice(0, config.maxCategoriesPerRepo);

      if (cats.length > 0 && !resultMap.has(id)) {
        resultMap.set(id, cats);
      }
    }

    // Remaining repos get the fallback bucket
    for (const repo of repos) {
      if (!resultMap.has(repo.id)) {
        resultMap.set(repo.id, [fallbackCategory]);
      }
    }
  }

  return resultMap;
}
