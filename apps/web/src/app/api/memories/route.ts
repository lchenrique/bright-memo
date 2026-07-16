import { NextResponse } from 'next/server';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3001';

function getKey(request: Request): string | null {
  const h = request.headers.get('x-api-key');
  if (h) return h;
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  const m = cookie.match(/bm_api_key=([^;]+)/);
  return m ? m[1]! : null;
}

export async function GET(request: Request) {
  const key = getKey(request);
  if (!key) return NextResponse.json({ error: 'No key' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const limit = searchParams.get('limit');
  const q = searchParams.get('q');

  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  if (limit) params.set('limit', limit);
  if (q) params.set('q', q);
  const qs = params.toString();
  const path = qs ? `/v1/memories?${qs}` : '/v1/memories';

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: Request) {
  const key = getKey(request);
  if (!key) return NextResponse.json({ error: 'No key' }, { status: 401 });

  const body = await request.json();
  const res = await fetch(`${API_BASE}/v1/memories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
