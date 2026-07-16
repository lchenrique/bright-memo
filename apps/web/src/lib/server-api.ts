import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3001';

async function getKey(): Promise<string> {
  const store = await cookies();
  const key = store.get('bm_api_key')?.value;
  if (!key) redirect('/login');
  return key;
}

export async function apiGet<T>(path: string): Promise<T> {
  const key = await getKey();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.status === 401) redirect('/login');
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const key = await getKey();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) redirect('/login');
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const key = await getKey();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) redirect('/login');
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const key = await getKey();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.status === 401) redirect('/login');
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
}
