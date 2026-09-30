/**
 * Embedding client used by the taxonomy agent.
 *
 * Supports any OpenAI-compatible `/embeddings` endpoint (OpenAI, DeepSeek,
 * OpenRouter, Ollama, vLLM, LM Studio, ...) and Google Gemini's native
 * `embedContent` API. The client is optional: when the embedding endpoint is
 * not configured or not reachable, the taxonomy agent is skipped and the
 * normal classification flow continues.
 */
import { GoogleGenAI } from "@google/genai";
import type { Config } from "../utils/config";

export type EmbeddingProvider = "openai" | "gemini";

export interface EmbeddingClient {
  readonly provider: EmbeddingProvider;
  readonly model: string;
  /** Embeds the given texts, preserving order. */
  embed(texts: string[]): Promise<number[][]>;
}

/** How many texts are sent to the embedding endpoint in one request. */
const EMBEDDING_CHUNK_SIZE = 64;

/**
 * Builds the text that represents one repository for similarity purposes:
 * name + description + language + a star-count hint.
 */
export function repoEmbeddingText(parts: {
  id: string;
  description?: string | null;
  language?: string | null;
  stars?: number | null;
}): string {
  const name = parts.id.replace(/[\/_-]+/g, " ");
  return [
    name,
    parts.description ?? "",
    parts.language ? `language: ${parts.language}` : "",
    parts.stars != null ? `stars: ${parts.stars}` : "",
  ]
    .filter((piece) => piece.trim() !== "")
    .join("\n");
}

/** Builds the text that represents a category for similarity purposes. */
export function categoryEmbeddingText(category: {
  name: string;
  description: string;
}): string {
  return `${category.name.replace(/-/g, " ")}\n${category.description}`;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Mean vector of `vectors` (returns an empty array when there is nothing). */
export function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dimension = vectors[0].length;
  const sum = new Array<number>(dimension).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < dimension; i++) sum[i] += vector[i] ?? 0;
  }
  return sum.map((value) => value / vectors.length);
}

/** Mean pairwise similarity inside a group (1 with a single vector). */
export function meanPairwiseSimilarity(vectors: number[][]): number {
  if (vectors.length < 2) return 1;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      total += cosineSimilarity(vectors[i], vectors[j]);
      pairs++;
    }
  }
  return pairs === 0 ? 0 : total / pairs;
}

/** Mean similarity between every vector of `a` and every vector of `b`. */
export function crossSimilarity(a: number[][], b: number[][]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let total = 0;
  for (const left of a) {
    for (const right of b) total += cosineSimilarity(left, right);
  }
  return total / (a.length * b.length);
}

/**
 * Whether the configuration carries enough information to talk to an
 * embedding endpoint. The model and key are always resolvable when an AI
 * provider is configured, so this is only false for a hand-written config
 * without any key.
 */
export function isEmbeddingConfigured(config: Config): boolean {
  return config.embeddingApiKey.trim() !== "" && config.embeddingModel.trim() !== "";
}

/**
 * Creates the embedding client, or `null` when no credentials are available.
 * Network/HTTP failures surface as thrown errors; the caller decides whether
 * to disable the taxonomy agent for the rest of the run.
 */
export function createEmbeddingClient(config: Config): EmbeddingClient | null {
  if (!isEmbeddingConfigured(config)) return null;

  const cache = new Map<string, number[]>();

  const embed = async (texts: string[]): Promise<number[][]> => {
    const results: number[][] = new Array(texts.length);
    const missing: { index: number; text: string }[] = [];

    texts.forEach((text, index) => {
      const cached = cache.get(text);
      if (cached) results[index] = cached;
      else missing.push({ index, text });
    });

    for (let start = 0; start < missing.length; start += EMBEDDING_CHUNK_SIZE) {
      const chunk = missing.slice(start, start + EMBEDDING_CHUNK_SIZE);
      const vectors =
        config.embeddingProvider === "gemini"
          ? await embedWithGemini(config, chunk.map((item) => item.text))
          : await embedWithOpenAI(config, chunk.map((item) => item.text));

      chunk.forEach((item, offset) => {
        const vector = vectors[offset];
        if (!vector || vector.length === 0) {
          throw new Error(
            `Embedding endpoint returned no vector for ${item.text.slice(0, 40)}...`,
          );
        }
        cache.set(item.text, vector);
        results[item.index] = vector;
      });
    }

    return results;
  };

  return {
    provider: config.embeddingProvider,
    model: config.embeddingModel,
    embed,
  };
}

async function embedWithOpenAI(
  config: Config,
  texts: string[],
): Promise<number[][]> {
  const endpoint = `${config.embeddingBaseUrl}/embeddings`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.embeddingApiKey}`,
    },
    body: JSON.stringify({ model: config.embeddingModel, input: texts }),
    signal: AbortSignal.timeout(config.openaiTimeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Embedding endpoint ${endpoint} returned ${response.status} ${response.statusText}${
        body ? `: ${body.slice(0, 200)}` : ""
      }`,
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };
  const data = payload.data ?? [];
  if (data.length !== texts.length) {
    throw new Error(
      `Embedding endpoint returned ${data.length} vectors for ${texts.length} inputs`,
    );
  }

  const ordered: number[][] = new Array(texts.length);
  const seen = new Set<number>();
  let dimension: number | null = null;
  data.forEach((item, position) => {
    const index = item.index ?? position;
    if (!Number.isInteger(index) || index < 0 || index >= texts.length || seen.has(index)) {
      throw new Error(`Embedding endpoint returned an invalid or duplicate index: ${String(index)}`);
    }
    const vector = item.embedding;
    if (!Array.isArray(vector) || vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
      throw new Error(`Embedding endpoint returned an invalid vector at index ${index}`);
    }
    if (dimension === null) dimension = vector.length;
    if (vector.length !== dimension) {
      throw new Error(`Embedding endpoint returned inconsistent vector dimensions: expected ${dimension}, got ${vector.length}`);
    }
    seen.add(index);
    ordered[index] = vector;
  });
  if (seen.size !== texts.length || ordered.some((vector) => !vector)) {
    throw new Error("Embedding endpoint returned an incomplete vector mapping");
  }
  return ordered;
}

async function embedWithGemini(
  config: Config,
  texts: string[],
): Promise<number[][]> {
  const ai = new GoogleGenAI({ apiKey: config.embeddingApiKey });
  const response = (await ai.models.embedContent({
    model: config.embeddingModel,
    contents: texts,
  })) as {
    embeddings?: Array<{ values?: number[] }>;
    embedding?: { values?: number[] };
  };

  const embeddings = response.embeddings ?? (response.embedding ? [response.embedding] : []);
  return embeddings.map((item) => item.values ?? []);
}
