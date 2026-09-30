/**
 * Markdown output writer.
 *
 * Turns a category assignment (repo id -> category names) into a browsable
 * flat Markdown layout:
 *
 *   <outputDir>/README.md          index / table of contents
 *   <outputDir>/<Category>.md      one file per category
 *
 * Files written here are the final artifact of `plan` + `classify` - the tool
 * no longer touches GitHub Lists.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join, resolve } from "path";
import type { Category } from "../types";
import { UNCATEGORIZED_CATEGORY_NAME } from "../types";

/** Marker on the generated index file */
export const INDEX_MARKER = "<!-- startidy:index -->";
/** Marker on a generated category file; carries the original category name */
export const CATEGORY_MARKER_PREFIX = "<!-- startidy:category";
/** Extension used for every generated category file */
export const CATEGORY_FILE_EXTENSION = ".md";
/** Reserved name of the generated index file */
export const INDEX_FILE_NAME = "README.md";

const CATEGORY_MARKER_RE =
  /<!--\s*startidy:category\s+name="([^"]*)"(?:\s+description="([^"]*)")?\s*-->/;
const REPO_LINK_RE = /^-\s+\[[^\]]*\]\(https:\/\/github\.com\/([^/\s)]+)\/([^/\s)#?]+)\)/;

const INDEX_TITLE = "# ⭐ Starred Repositories";

/** Shown inside the bucket that collects what the AI could not place */
const UNCATEGORIZED_DESCRIPTION = "AI 无法归类的仓库，已单独列出";

/**
 * File systems reject names longer than 255 bytes, and CJK category names cost
 * 3 bytes per character, so the generated file name is capped well below that
 * (measured in bytes, leaving room for the ".md" suffix and uniqueness suffix).
 * Category names themselves have no length limit.
 */
const MAX_FILE_BASE_BYTES = 200;

export interface RepoEntry {
  id: string; // owner/name
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
}

export interface CategorySection {
  name: string; // display name, e.g. "AI: LLM & Chatbot"
  description: string;
  file: string; // filesystem-safe file name, e.g. "AI-LLM & Chatbot.md"
  repos: RepoEntry[];
}

export interface ExistingCategory {
  name: string;
  description: string;
  file: string;
  repoIds: Set<string>;
}

export interface ExistingOutput {
  dir: string;
  exists: boolean;
  categories: ExistingCategory[];
  /** Union of every repo id already present in the output */
  repoIds: Set<string>;
}

export interface WriteOutputResult {
  dir: string;
  categories: number;
  repositories: number;
  /** Repo ids that ended up in at least one category */
  assigned: Set<string>;
  files: string[];
  removedFiles: string[];
}

/* ------------------------------------------------------------------ */
/* Naming helpers                                                      */
/* ------------------------------------------------------------------ */

/**
 * Converts a category name into a filesystem-safe Markdown file name.
 * The human readable name is kept inside the file, so lossy replacements are safe.
 *
 * "Web: Frontend" -> "Web-Frontend.md", "AI: LLM & Chatbot" -> "AI-LLM & Chatbot.md"
 */
export function categoryFileName(name: string): string {
  let base = name
    .trim()
    .replace(/:\s+/g, "-") // "Web: Frontend" -> "Web-Frontend"
    .replace(/:/g, "-") // any remaining colon
    .replace(/[<>"/\\|?*]/g, "-") // characters Windows rejects in file names
    .replace(/[\u0000-\u001f\u007f]/g, "") // control characters
    .replace(/\s+/g, " ")
    .replace(/-{2,}/g, "-")
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "")
    .trim();

  if (!base || base === "." || base === "..") base = "ETC";
  if (Buffer.byteLength(base, "utf8") > MAX_FILE_BASE_BYTES) {
    let truncated = "";
    for (const ch of base) {
      if (Buffer.byteLength(truncated + ch, "utf8") > MAX_FILE_BASE_BYTES) break;
      truncated += ch;
    }
    base = truncated.replace(/[.\s]+$/, "");
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = `_${base}`;
  // Never collide with the index file and never end up with a bare ".md"
  if (base.toLowerCase() === "readme") base = "README-category";
  if (base.toLowerCase().endsWith(CATEGORY_FILE_EXTENSION)) {
    base = base.slice(0, -CATEGORY_FILE_EXTENSION.length);
  }

  return `${base}${CATEGORY_FILE_EXTENSION}`;
}

/** Plain-text escaping for Markdown link labels / table cells */
function escapeLabel(text: string): string {
  return text.replace(/([\\[\]|])/g, "\\$1");
}

/** Escapes a value so it can live inside an HTML-comment marker attribute */
function escapeMarkerValue(text: string): string {
  return text
    .replace(/--+/g, "-")
    .replace(/"/g, "&quot;")
    .replace(/\r?\n/g, " ")
    .trim();
}

function unescapeMarkerValue(text: string): string {
  return text.replace(/&quot;/g, '"').trim();
}

/** One-line, Markdown-safe repository description */
function inlineDescription(description: string | null): string {
  if (!description) return "";
  const single = description.replace(/\s+/g, " ").trim();
  return escapeLabel(single);
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

export interface RenderMeta {
  generatedAt: string; // ISO date (YYYY-MM-DD)
  username?: string;
  totalRepos: number;
}

export function renderIndexReadme(
  sections: CategorySection[],
  meta: RenderMeta,
): string {
  const lines: string[] = [];

  lines.push(INDEX_MARKER);
  lines.push("");
  lines.push(INDEX_TITLE);
  lines.push("");
  lines.push(
    `Auto-generated by [startidy](https://github.com/) on ${meta.generatedAt}` +
      (meta.username ? ` for @${meta.username}` : "") +
      `. Do not edit by hand - re-run the tool instead.`,
  );
  lines.push("");
  lines.push(`- **Repositories:** ${meta.totalRepos}`);
  lines.push(`- **Categories:** ${sections.length}`);
  lines.push("");
  lines.push("## Categories");
  lines.push("");
  lines.push("| Category | Repositories |");
  lines.push("| --- | ---: |");

  for (const section of sections) {
    const target = encodeURIComponent(section.file);
    lines.push(
      `| [${escapeLabel(section.name)}](${target}) | ${section.repos.length} |`,
    );
  }

  lines.push("");
  lines.push(
    "> A repository can appear in more than one category, so the numbers above may sum to more than the repository total.",
  );
  lines.push("");

  return lines.join("\n");
}

export function renderCategoryReadme(
  section: CategorySection,
  meta: RenderMeta,
): string {
  const lines: string[] = [];

  lines.push(
    `${CATEGORY_MARKER_PREFIX} name="${escapeMarkerValue(section.name)}"` +
      (section.description
        ? ` description="${escapeMarkerValue(section.description)}"`
        : "") +
      ` -->`,
  );
  lines.push("");
  lines.push(`# ${section.name}`);
  lines.push("");

  if (section.description) {
    lines.push(section.description);
    lines.push("");
  }

  lines.push(`[← Back to index](${INDEX_FILE_NAME})`);
  lines.push("");
  lines.push(`**${section.repos.length} ${section.repos.length === 1 ? "repository" : "repositories"}**`);
  lines.push("");

  if (section.repos.length === 0) {
    lines.push("_No repositories in this category yet._");
  } else {
    for (const repo of section.repos) {
      const details: string[] = [];
      if (repo.language) details.push(repo.language);
      if (repo.stars > 0) details.push(`⭐ ${repo.stars}`);

      const description = inlineDescription(repo.description);
      let line = `- [${repo.id}](${repo.url})`;
      if (description) line += ` — ${description}`;
      if (details.length > 0) line += ` *(${details.join(" · ")})*`;
      lines.push(line);
    }
  }

  lines.push("");
  lines.push(`_Generated by startidy on ${meta.generatedAt}._`);
  lines.push("");

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Reading existing output (powers --only-new and --use-existing)       */
/* ------------------------------------------------------------------ */

/** Reads a generated category file; null when the file is not startidy's */
function readCategoryFile(
  path: string,
  fileName: string,
): ExistingCategory | null {
  if (!existsSync(path)) return null;

  const content = readFileSync(path, "utf-8");
  const marker = CATEGORY_MARKER_RE.exec(content);
  if (!marker) return null; // not generated by startidy

  const repoIds = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const match = REPO_LINK_RE.exec(line);
    if (match) repoIds.add(`${match[1]}/${match[2]}`);
  }

  return {
    name: unescapeMarkerValue(marker[1]) || fileName,
    description: marker[2] ? unescapeMarkerValue(marker[2]) : "",
    file: fileName,
    repoIds,
  };
}

export function readExistingOutput(outputDir: string): ExistingOutput {
  const dir = resolve(outputDir);
  const result: ExistingOutput = {
    dir,
    exists: existsSync(dir),
    categories: [],
    repoIds: new Set<string>(),
  };

  if (!result.exists) return result;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return result;
  }

  for (const entry of entries) {
    try {
      const path = join(dir, entry);

      // Current layout: one Markdown file per category
      if (statSync(path).isFile()) {
        if (!entry.toLowerCase().endsWith(CATEGORY_FILE_EXTENSION)) continue;
        if (entry === INDEX_FILE_NAME) continue;

        const category = readCategoryFile(path, entry);
        if (!category) continue;

        for (const id of category.repoIds) result.repoIds.add(id);
        result.categories.push(category);
        continue;
      }

      // Legacy layout: <Category>/README.md
      const legacyPath = join(path, "README.md");
      const legacy = readCategoryFile(legacyPath, entry);
      if (!legacy) continue;

      for (const id of legacy.repoIds) result.repoIds.add(id);
      result.categories.push(legacy);
    } catch {
      // Ignore unreadable entries - they are simply not reused
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

export interface WriteOutputOptions {
  outputDir: string;
  categories: Category[];
  /** repo id -> category names, as returned by the AI */
  assignments: Map<string, string[]>;
  /** Every starred repository (metadata source), keyed by "owner/name" */
  repos: Map<string, RepoEntry>;
  /** Merge into (instead of replacing) what is already on disk */
  merge: boolean;
  username?: string;
}

function toEntry(id: string, known: Map<string, RepoEntry>): RepoEntry {
  const found = known.get(id);
  if (found) return found;
  return {
    id,
    url: `https://github.com/${id}`,
    description: null,
    language: null,
    stars: 0,
  };
}

export function writeOutput(options: WriteOutputOptions): WriteOutputResult {
  const { categories, assignments, repos, merge, username } = options;
  const dir = resolve(options.outputDir);
  const generatedAt = new Date().toISOString().slice(0, 10);
  const meta: RenderMeta = {
    generatedAt,
    username,
    totalRepos: repos.size,
  };

  const existing = merge
    ? readExistingOutput(dir)
    : { dir, exists: false, categories: [], repoIds: new Set<string>() };

  const usedFiles = new Set<string>([INDEX_FILE_NAME]);
  const sections: CategorySection[] = [];

  // 1. Categories from the current plan
  for (const category of categories) {
    const file = uniqueFile(categoryFileName(category.name), usedFiles);
    usedFiles.add(file);

    const repoIds = new Set<string>();
    for (const [id, names] of assignments) {
      if (names.includes(category.name)) repoIds.add(id);
    }

    // merge: keep what was already filed under this category
    if (merge) {
      const previous = existing.categories.find((c) => c.name === category.name);
      for (const id of previous?.repoIds ?? []) repoIds.add(id);
    }

    sections.push({
      name: category.name,
      description: category.description || "",
      file,
      repos: sortedEntries(repoIds, repos),
    });
  }

  // 1b. Repositories the AI could not place always get their own bucket, so
  // they stay visible instead of being silently filed under a real category.
  const uncategorizedIds = new Set<string>();
  for (const [id, names] of assignments) {
    if (names.includes(UNCATEGORIZED_CATEGORY_NAME)) uncategorizedIds.add(id);
  }

  if (
    uncategorizedIds.size > 0 &&
    !categories.some((c) => c.name === UNCATEGORIZED_CATEGORY_NAME)
  ) {
    if (merge) {
      const previous = existing.categories.find(
        (c) => c.name === UNCATEGORIZED_CATEGORY_NAME,
      );
      for (const id of previous?.repoIds ?? []) uncategorizedIds.add(id);
    }

    const file = uniqueFile(
      categoryFileName(UNCATEGORIZED_CATEGORY_NAME),
      usedFiles,
    );
    usedFiles.add(file);

    sections.push({
      name: UNCATEGORIZED_CATEGORY_NAME,
      description: UNCATEGORIZED_DESCRIPTION,
      file,
      repos: sortedEntries(uncategorizedIds, repos),
    });
  }

  // 2. merge: keep categories that exist on disk but are not in the plan
  if (merge) {
    for (const previous of existing.categories) {
      if (categories.some((c) => c.name === previous.name)) continue;
      if (sections.some((s) => s.name === previous.name)) continue;

      const file = uniqueFile(
        previous.file.toLowerCase().endsWith(CATEGORY_FILE_EXTENSION)
          ? previous.file
          : `${previous.file}${CATEGORY_FILE_EXTENSION}`,
        usedFiles,
      );
      usedFiles.add(file);

      sections.push({
        name: previous.name,
        description: previous.description,
        file,
        repos: sortedEntries(previous.repoIds, repos),
      });
    }
  }

  // 3. Write everything
  const files: string[] = [];
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, INDEX_FILE_NAME), renderIndexReadme(sections, meta), "utf-8");
  files.push(INDEX_FILE_NAME);

  for (const section of sections) {
    writeFileSync(
      join(dir, section.file),
      renderCategoryReadme(section, meta),
      "utf-8",
    );
    files.push(section.file);
  }

  // 4. Drop stale startidy-generated files (full run only)
  const removedFiles = merge
    ? []
    : removeStaleOutput(dir, new Set(sections.map((s) => s.file)));

  const assigned = new Set<string>();
  for (const section of sections) {
    for (const repo of section.repos) assigned.add(repo.id);
  }

  return {
    dir,
    categories: sections.length,
    repositories: assigned.size,
    assigned,
    files,
    removedFiles,
  };
}

function sortedEntries(
  ids: Set<string>,
  known: Map<string, RepoEntry>,
): RepoEntry[] {
  return Array.from(ids)
    .map((id) => toEntry(id, known))
    .sort((a, b) => b.stars - a.stars || a.id.localeCompare(b.id));
}

function uniqueFile(file: string, used: Set<string>): string {
  if (!used.has(file)) return file;

  const base = file.slice(0, -CATEGORY_FILE_EXTENSION.length);
  let suffix = 2;
  while (used.has(`${base}-${suffix}${CATEGORY_FILE_EXTENSION}`)) suffix++;
  return `${base}-${suffix}${CATEGORY_FILE_EXTENSION}`;
}

/**
 * Removes Markdown files that were clearly generated by startidy and are no
 * longer part of the output, plus leftovers of the legacy folder layout.
 * Hand-written files and subdirectories are never touched.
 */
function removeStaleOutput(dir: string, keep: Set<string>): string[] {
  const removed: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return removed;
  }

  for (const entry of entries) {
    const path = join(dir, entry);

    try {
      if (statSync(path).isFile()) {
        if (!entry.toLowerCase().endsWith(CATEGORY_FILE_EXTENSION)) continue;
        if (entry === INDEX_FILE_NAME) continue;
        if (keep.has(entry)) continue;
        if (!CATEGORY_MARKER_RE.test(readFileSync(path, "utf-8"))) continue;

        rmSync(path, { force: true });
        removed.push(entry);
        continue;
      }

      // Legacy layout: <Category>/README.md generated by an older version
      if (readCategoryFile(join(path, "README.md"), entry)) {
        rmSync(path, { recursive: true, force: true });
        removed.push(`${entry}/`);
      }
    } catch {
      // Leave anything we cannot inspect alone
    }
  }

  return removed;
}

/**
 * Deletes generated Markdown files (and legacy generated folders). Only files
 * carrying a startidy marker are removed, so pointing OUTPUT_DIR at a folder
 * you also edit by hand is safe.
 */
export function clearOutput(outputDir: string): string[] {
  const dir = resolve(outputDir);
  if (!existsSync(dir)) return [];

  const removed: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return removed;
  }

  for (const entry of entries) {
    const target = join(dir, entry);

    try {
      if (statSync(target).isDirectory()) {
        // Legacy layout folder
        if (!readCategoryFile(join(target, "README.md"), entry)) continue;
        rmSync(target, { recursive: true, force: true });
        removed.push(`${entry}/`);
        continue;
      }

      if (!entry.toLowerCase().endsWith(CATEGORY_FILE_EXTENSION)) continue;

      const content = readFileSync(target, "utf-8");
      const generated =
        entry === INDEX_FILE_NAME
          ? content.includes(INDEX_MARKER)
          : CATEGORY_MARKER_RE.test(content);
      if (!generated) continue;

      rmSync(target, { force: true });
      removed.push(entry);
    } catch {
      // Ignore anything we cannot inspect
    }
  }

  return removed;
}

/** Builds the metadata lookup used by writeOutput from raw GitHub repos */
export function buildRepoEntries(
  repos: Array<{
    name: string;
    owner: { login: string };
    description: string | null;
    language: string | null;
    stargazers_count: number;
  }>,
): Map<string, RepoEntry> {
  const map = new Map<string, RepoEntry>();
  for (const repo of repos) {
    const id = `${repo.owner.login}/${repo.name}`;
    map.set(id, {
      id,
      url: `https://github.com/${id}`,
      description: repo.description ?? null,
      language: repo.language ?? null,
      stars: repo.stargazers_count,
    });
  }
  return map;
}
