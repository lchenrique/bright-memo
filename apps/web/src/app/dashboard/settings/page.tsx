'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
  const [maskedKey] = useState(() => {
    const m = document.cookie.match(/bm_api_key=([^;]+)/);
    return m ? `${m[1]!.slice(0, 8)}...${m[1]!.slice(-4)}` : '—';
  });

  async function handleLogout() {
    await fetch('/api/auth/logout');
    router.push('/login');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <h1 className="text-2xl font-bold">Configuracoes</h1>

      <div className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-zinc-500">API URL</label>
          <p className="mt-1 text-sm text-zinc-900">{apiUrl}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-500">API Key</label>
          <p className="mt-1 text-sm text-zinc-900">{maskedKey}</p>
        </div>

        <hr />

        <button
          onClick={handleLogout}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
