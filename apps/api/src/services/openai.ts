import { getEnv } from '../config/env.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 8_000;
const OPENAI_API_BASE = 'https://api.openai.com/v1';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface EmbeddingRequestOptions {
  apiKey: string | null;
  fetchImpl?: FetchLike;
  maxRetries?: number;
  timeoutMs?: number;
  sleepImpl?: (milliseconds: number) => Promise<void>;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validEmbeddingResponse(value: unknown): number[][] | null {
  if (!value || typeof value !== 'object' || !('data' in value) || !Array.isArray(value.data)) {
    return null;
  }

  const rows = value.data as Array<{ index?: unknown; embedding?: unknown }>;
  if (
    rows.length === 0 ||
    rows.some(
      (row) =>
        typeof row.index !== 'number' ||
        !Array.isArray(row.embedding) ||
        row.embedding.length !== EMBEDDING_DIMENSIONS ||
        row.embedding.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry)),
    )
  ) {
    return null;
  }

  return [...rows]
    .sort((a, b) => (a.index as number) - (b.index as number))
    .map((row) => row.embedding as number[]);
}

export async function requestEmbeddings(
  input: string | string[],
  options: EmbeddingRequestOptions,
): Promise<number[][] | null> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey || apiKey === 'sk-replace-me') return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRetries = Math.max(1, options.maxRetries ?? MAX_RETRIES);
  const timeoutMs = Math.max(1, options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const sleepImpl = options.sleepImpl ?? sleep;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${OPENAI_API_BASE}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
        signal: controller.signal,
      });

      if (response.ok) return validEmbeddingResponse(await response.json().catch(() => null));

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === maxRetries) return null;
    } catch {
      if (attempt === maxRetries) return null;
    } finally {
      clearTimeout(timeout);
    }

    await sleepImpl(BASE_DELAY_MS * 2 ** (attempt - 1));
  }

  return null;
}

function configuredApiKey(): string | null {
  return getEnv().OPENAI_API_KEY ?? null;
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  const result = await requestEmbeddings(text, { apiKey: configuredApiKey() });
  return result?.[0] ?? null;
}

export async function getEmbeddings(texts: string[]): Promise<number[][] | null> {
  return requestEmbeddings(texts, { apiKey: configuredApiKey() });
}
