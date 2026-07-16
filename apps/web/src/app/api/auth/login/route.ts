import { NextResponse } from 'next/server';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3001';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    let apiKey: string;

    if (body.apiKey && typeof body.apiKey === 'string') {
      apiKey = body.apiKey;
      const meRes = await fetch(`${API_BASE}/v1/me`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!meRes.ok) {
        return NextResponse.json({ error: 'API key invalida' }, { status: 401 });
      }
    } else if (body.email && body.bootstrapToken) {
      const email = String(body.email);
      const bootstrapToken = String(body.bootstrapToken);

      const keyRes = await fetch(`${API_BASE}/v1/auth/keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bootstrapToken}`,
        },
        body: JSON.stringify({ email }),
      });

      if (!keyRes.ok) {
        return NextResponse.json({ error: 'Falha ao criar chave' }, { status: 401 });
      }

      const keyData = (await keyRes.json()) as { key: string };
      apiKey = keyData.key;
    } else {
      return NextResponse.json(
        { error: 'Envie { email, bootstrapToken } ou { apiKey }' },
        { status: 400 },
      );
    }

    const response = NextResponse.json({ ok: true });

    response.cookies.set('bm_api_key', apiKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
