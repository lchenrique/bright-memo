'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type LoginMode = 'token' | 'key';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('token');
  const [email, setEmail] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const body = mode === 'token' ? { email, bootstrapToken } : { apiKey };

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Falha na autenticacao');
        return;
      }

      router.push('/dashboard');
    } catch {
      setError('Erro de conexao');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm rounded-xl border bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-2xl font-bold">Bright Memo</h1>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('token')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
              mode === 'token' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'
            }`}
          >
            Token
          </button>
          <button
            type="button"
            onClick={() => setMode('key')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
              mode === 'key' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'
            }`}
          >
            API Key
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'token' ? (
            <>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="bootstrapToken" className="block text-sm font-medium text-zinc-700">
                  Bootstrap Token
                </label>
                <input
                  id="bootstrapToken"
                  type="password"
                  required
                  value={bootstrapToken}
                  onChange={(e) => setBootstrapToken(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-zinc-700">
                API Key
              </label>
              <input
                id="apiKey"
                type="password"
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
