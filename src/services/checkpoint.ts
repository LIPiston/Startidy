/**
 * Crash-safe progress file.
 *
 * `<outputDir>/.startidy-state.json` is refreshed after every finished batch,
 * so an interrupted classification run can pick up where it stopped instead of
 * starting over. The file is removed once the run completes.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join, resolve } from "path";
import type { Category } from "../types";

/** Name of the progress file inside the output directory */
export const CHECKPOINT_FILE_NAME = ".startidy-state.json";
/** Bumped when the on-disk shape changes */
export const CHECKPOINT_VERSION = 2;

export interface CheckpointState {
  version: number;
  /** ISO timestamp of the last update */
  updatedAt: string;
  /** Categories the run was started with (they must match to resume) */
  categories: Category[];
  /** Repo id -> category names, for every finished batch */
  assignments: Record<string, string[]>;
  /** Repos whose batch failed (they are retried on the next run) */
  failedIds: string[];
  /** Repos that were still queued when the file was written */
  pendingIds: string[];
  /** Size of the run this file belongs to */
  totalRepos: number;
  /** Stable identity of the input repository set and initial category plan. */
  runIdentity: string;
  /** Number of times each repository has been requeued by the agent. */
  requeueCounts: Record<string, number>;
  /**
   * The taxonomy agent added or split categories during this run, so the
   * categories here are newer than the plan and always win on resume.
   */
  agentModifiedCategories?: boolean;
}

export function checkpointPath(outputDir: string): string {
  return join(resolve(outputDir), CHECKPOINT_FILE_NAME);
}

/** Reads the progress file; null when absent, unreadable or malformed. */
export function loadCheckpoint(outputDir: string): CheckpointState | null {
  const path = checkpointPath(outputDir);
  if (!existsSync(path)) return null;

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as CheckpointState;

    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== CHECKPOINT_VERSION) return null;
    if (!Array.isArray(parsed.categories) || parsed.categories.length === 0) {
      return null;
    }
    if (!parsed.assignments || typeof parsed.assignments !== "object" || Array.isArray(parsed.assignments)) {
      return null;
    }
    if (typeof parsed.runIdentity !== "string" || parsed.runIdentity.length === 0) {
      return null;
    }
    if (!parsed.requeueCounts || typeof parsed.requeueCounts !== "object") {
      return null;
    }
    if (!Number.isSafeInteger(parsed.totalRepos) || parsed.totalRepos < 0) return null;

    return {
      version: parsed.version,
      updatedAt: parsed.updatedAt ?? "",
      categories: parsed.categories.map((c) => ({
        name: c.name,
        description: c.description ?? "",
        keywords: Array.isArray(c.keywords) ? c.keywords : [],
      })),
      assignments: parsed.assignments,
      failedIds: Array.isArray(parsed.failedIds) ? parsed.failedIds : [],
      pendingIds: Array.isArray(parsed.pendingIds) ? parsed.pendingIds : [],
      totalRepos: parsed.totalRepos,
      runIdentity: parsed.runIdentity,
      requeueCounts: Object.fromEntries(
        Object.entries(parsed.requeueCounts).filter(
          ([, count]) => Number.isSafeInteger(count) && count >= 0,
        ),
      ),
      agentModifiedCategories: parsed.agentModifiedCategories === true,
    };
  } catch {
    return null;
  }
}

export function saveCheckpoint(outputDir: string, state: CheckpointState): void {
  const dir = resolve(outputDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, CHECKPOINT_FILE_NAME),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf-8",
  );
}

export function clearCheckpoint(outputDir: string): void {
  rmSync(checkpointPath(outputDir), { force: true });
}

/** True when both plans contain the same categories in the same order. */
export function sameCategories(a: Category[], b: Category[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((category, index) => category.name === b[index]?.name);
}
