import { loadConfig } from './config.js';
import { ApiError } from './errors.js';

export interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiCall<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const config = loadConfig();
  const baseUrl = config.apiUrl?.replace(/\/+$/, '') ?? 'http://localhost:3001';
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let body: { error?: { code?: string; message?: string } } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* ignore parse errors */
    }
    throw new ApiError(body.error?.message ?? res.statusText, res.status, body.error?.code);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
