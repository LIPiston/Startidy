import { restPaginated, GitHubAPIError } from "./client";
import type { Repo } from "./types";

export type ProgressCallback = (current: number, message?: string) => void;

/**
 * Fetches all repositories owned by the authenticated user
 */
export async function fetchAllMyRepos(
  token: string,
  owner: string,
  onProgress?: ProgressCallback,
): Promise<{ repos?: Repo[]; status: number }> {
  try {
    const repos = await restPaginated<Repo>(
      token,
      "/user/repos?sort=updated",
      onProgress,
    );
    return { status: 200, repos };
  } catch (error) {
    if (error instanceof GitHubAPIError && error.statusCode) {
      return { status: error.statusCode };
    }
    throw error;
  }
}

/**
 * Fetches all starred repositories for the authenticated user
 */
export async function fetchAllMyStarredRepos(
  token: string,
  owner: string,
  onProgress?: ProgressCallback,
): Promise<{ repos?: Repo[]; status: number }> {
  try {
    const repos = await restPaginated<Repo>(
      token,
      "/user/starred?sort=updated",
      onProgress,
    );
    return { status: 200, repos };
  } catch (error) {
    if (error instanceof GitHubAPIError && error.statusCode) {
      return { status: error.statusCode };
    }
    throw error;
  }
}
