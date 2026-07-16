/**
 * OpenAI embeddings service.
 *
 * Thin wrapper around the OpenAI Embeddings API. Uses the native `fetch`
 * instead of the SDK to avoid adding a heavy dependency for a single
 * endpoint. The caller is responsible for catching AppErrors and mapping
 * them to HTTP responses.
 */

import { getEnv } from '../config/env.js';

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class AppError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

const OPENAI_API_BASE = 'https://api.openai.com/v1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveApiKey(): string {
  const key = getEnv().OPENAI_API_KEY;
  if (!key || key === 'sk-replace-me') {
    throw new AppError(
      'EMBEDDING_CONFIG_ERROR',
      'OpenAI API key is not configured — set OPENAI_API_KEY in your environment',
    );
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

async function embed(input: string | string[]): Promise<number[][]> {
  const apiKey = resolveApiKey();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${OPENAI_API_BASE}/embeddings`, {
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
      });

      if (res.ok) {
        const json = (await res.json()) as {
          data: { index: number; embedding: number[] }[];
        };
        json.data.sort((a, b) => a.index - b.index);
        return json.data.map((d) => d.embedding);
      }

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
        await sleep(delay);
        continue;
      }

      const body = await res.json().catch(() => null);
      const message =
        (body as { error?: { message?: string } })?.error?.message ??
        `OpenAI API returned status ${res.status}`;

      throw new AppError('EMBEDDING_API_ERROR', message);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
        await sleep(delay);
      } else {
        throw new AppError(
          'EMBEDDING_API_ERROR',
          `Embedding request failed after ${MAX_RETRIES} retries`,
        );
      }
    }
  }

  throw new AppError(
    'EMBEDDING_API_ERROR',
    `Embedding request failed after ${MAX_RETRIES} retries`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getEmbedding(text: string): Promise<number[]> {
  const result = await embed(text);
  return result[0]!;
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  return embed(texts);
}
