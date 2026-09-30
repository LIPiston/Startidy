import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Repo } from "../api/types";

export const STAR_DATA_FILE = ".startidy-stars.json";
const STAR_DATA_VERSION = 1;

export interface StarDataCache {
  version: number;
  updatedAt: string;
  repos: Repo[];
  /** Starred repositories grouped by GitHub page for conditional requests. */
  pages: Record<string, Repo[]>;
  /** GitHub ETag per paginated response page. */
  etags: Record<string, string>;
}

export function loadStarData(file = STAR_DATA_FILE): StarDataCache | null {
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as Partial<StarDataCache>;
    if (
      parsed.version !== STAR_DATA_VERSION ||
      !Array.isArray(parsed.repos) ||
      !parsed.etags ||
      typeof parsed.etags !== "object"
    ) {
      return null;
    }
    const pages = parsed.pages && typeof parsed.pages === "object" && !Array.isArray(parsed.pages)
      ? parsed.pages
      : { "1": parsed.repos };
    if (Object.values(pages).some((page) => !Array.isArray(page))) return null;
    return {
      version: STAR_DATA_VERSION,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      repos: parsed.repos,
      pages,
      etags: parsed.etags,
    };
  } catch {
    return null;
  }
}

export function saveStarData(
  repos: Repo[],
  pages: Record<string, Repo[]>,
  etags: Record<string, string>,
  file = STAR_DATA_FILE,
): void {
  const data: StarDataCache = {
    version: STAR_DATA_VERSION,
    updatedAt: new Date().toISOString(),
    repos,
    pages,
    etags,
  };
  const parentDir = dirname(file);
  if (parentDir !== ".") mkdirSync(parentDir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}
