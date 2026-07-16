import Link from 'next/link';

import type { Memory } from '@bright-memo/shared';
import { apiGet } from '@/lib/server-api';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  let results: Memory[] = [];
  if (q && q.trim()) {
    try {
      results = await apiGet<Memory[]>(`/v1/memories?q=${encodeURIComponent(q)}`);
    } catch {
      results = [];
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <h1 className="text-2xl font-bold">Busca</h1>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Pesquisar memorias..."
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Buscar
        </button>
      </form>

      {q && (
        <p className="text-sm text-zinc-500">
          Resultados para &ldquo;{q}&rdquo; ({results.length} encontrados)
        </p>
      )}

      <div className="space-y-3">
        {results.map((m) => (
          <Link
            key={m.id}
            href={`/dashboard/memories/${m.id}`}
            className="block rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md"
          >
            <p className="line-clamp-3 text-sm text-zinc-800">{m.content}</p>
            {m.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {m.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
        {q && results.length === 0 && (
          <p className="text-sm text-zinc-400">Nenhum resultado encontrado.</p>
        )}
      </div>
    </div>
  );
}
