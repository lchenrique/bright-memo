import { NextResponse } from 'next/server';

export async function GET() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('bm_api_key', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
