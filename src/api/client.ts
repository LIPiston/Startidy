/**
 * GitHub API Client
 * Provides a unified interface for GitHub REST and GraphQL API calls
 */

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const USER_AGENT = "Stardust-CLI";

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (5xx server errors)
 */
function isRetryableStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

/**
 * Execute a fetch request with retry logic
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If successful or non-retryable error, return immediately
      if (response.ok || !isRetryableStatus(response.status)) {
        return response;
      }

      // For retryable errors, save and continue to retry
      if (attempt < retries) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.error(
          `\n⚠️  Server error (${response.status}). Retrying in ${delay / 1000}s... (${attempt + 1}/${retries})`,
        );
        await sleep(delay);
      } else {
        return response; // Return last failed response
      }
    } catch (error) {
      lastError = error as Error;

      if (attempt < retries) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.error(
          `\n⚠️  Network error. Retrying in ${delay / 1000}s... (${attempt + 1}/${retries})`,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}

export interface GitHubClientConfig {
  token: string;
}

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; type?: string; path?: string[] }>;
}

export class GitHubAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errors?: Array<{ message: string }>,
  ) {
    super(message);
    this.name = "GitHubAPIError";
  }
}

/**
 * Execute a GitHub GraphQL query
 */
export async function graphql<T = unknown>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetchWithRetry(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new GitHubAPIError(
      `GitHub API request failed (${response.status}): ${errorText}`,
      response.status,
    );
  }

  const result: GraphQLResponse<T> = await response.json();

  if (result.errors) {
    throw new GitHubAPIError(
      `GraphQL Error: ${result.errors.map((e) => e.message).join(", ")}`,
      undefined,
      result.errors,
    );
  }

  if (!result.data) {
    throw new GitHubAPIError("GitHub API returned empty data");
  }

  return result.data;
}

/**
 * Execute a GitHub REST API request
 */
export async function rest<T = unknown>(
  token: string,
  endpoint: string,
  options: RequestInit = {},
): Promise<{ data: T; status: number }> {
  const url = endpoint.startsWith("http") ? endpoint : `${GITHUB_API_URL}${endpoint}`;

  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new GitHubAPIError(
      `GitHub API request failed (${response.status}): ${errorText}`,
      response.status,
    );
  }

  const data: T = await response.json();
  return { data, status: response.status };
}

/**
 * Paginated REST API request - fetches all pages
 */
export async function restPaginated<T>(
  token: string,
  endpoint: string,
  onProgress?: (count: number) => void,
): Promise<T[]> {
  const result = await restPaginatedIncremental<T>(token, endpoint, undefined, onProgress);
  return result.items;
}

export interface IncrementalPageCache<T> {
  pages: Record<string, T[]>;
  etags: Record<string, string>;
}

export interface IncrementalPageResult<T> {
  items: T[];
  cache: IncrementalPageCache<T>;
}

/**
 * Fetches a paginated endpoint with conditional requests. Unchanged pages are
 * served from the local cache (304), while changed pages replace their cached
 * contents. This avoids downloading unchanged GitHub pages on every run.
 */
export async function restPaginatedIncremental<T>(
  token: string,
  endpoint: string,
  previous: IncrementalPageCache<T> | undefined,
  onProgress?: (count: number) => void,
): Promise<IncrementalPageResult<T>> {
  const pages: Record<string, T[]> = {};
  const etags: Record<string, string> = {};
  const allItems: T[] = [];
  let page = 1;

  while (true) {
    const pageKey = String(page);
    const separator = endpoint.includes("?") ? "&" : "?";
    const paginatedEndpoint = `${endpoint}${separator}page=${page}&per_page=100`;
    const url = paginatedEndpoint.startsWith("http")
      ? paginatedEndpoint
      : `${GITHUB_API_URL}${paginatedEndpoint}`;
    const previousEtag = previous?.etags[pageKey];
    const response = await fetchWithRetry(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
        ...(previousEtag ? { "If-None-Match": previousEtag } : {}),
      },
    });

    let items: T[];
    if (response.status === 304) {
      items = previous?.pages[pageKey] ?? [];
      if (!previous?.pages[pageKey]) {
        throw new GitHubAPIError(`GitHub returned 304 for uncached page ${page}`, 304);
      }
      if (previousEtag) etags[pageKey] = previousEtag;
    } else if (response.ok) {
      items = (await response.json()) as T[];
      pages[pageKey] = items;
      const etag = response.headers.get("etag");
      if (etag) etags[pageKey] = etag;
    } else {
      const errorText = await response.text();
      throw new GitHubAPIError(
        `GitHub API request failed (${response.status}): ${errorText}`,
        response.status,
      );
    }

    pages[pageKey] = items;
    allItems.push(...items);
    onProgress?.(allItems.length);

    if (items.length < 100) break;
    page++;
  }

  return { items: allItems, cache: { pages, etags } };
}
