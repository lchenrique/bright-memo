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

async function handler(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
  method: string,
) {
  const { path } = await params;
  const key = getKey(request);
  if (!key) return NextResponse.json({ error: 'No key' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  let apiPath = `/v1/${path.join('/')}`;
  if (qs) apiPath += `?${qs}`;

  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${key}` },
  };

  if (method !== 'GET' && method !== 'DELETE') {
    init.headers = {
      ...(init.headers as Record<string, string>),
      'Content-Type': 'application/json',
    };
    init.body = JSON.stringify(await request.json());
  }

  const res = await fetch(`${API_BASE}${apiPath}`, init);
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handler(request, { params }, 'GET');
}

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handler(request, { params }, 'POST');
}

export async function PATCH(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handler(request, { params }, 'PATCH');
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return handler(request, { params }, 'DELETE');
}
