import Link from 'next/link';

import type { Project, Memory } from '@bright-memo/shared';
import { apiGet } from '@/lib/server-api';

export default async function DashboardPage() {
  const [projects, memories] = await Promise.all([
    apiGet<Project[]>('/v1/projects').catch(() => [] as Project[]),
    apiGet<Memory[]>('/v1/memories?limit=5').catch(() => [] as Memory[]),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <form action="/dashboard/search" method="GET">
          <input
            name="q"
            placeholder="Buscar memorias..."
            className="w-64 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </form>
      </div>

      <div className="flex gap-3">
        <Link
          href="/dashboard/memories/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          New Memory
        </Link>
        <Link
          href="/dashboard/projects/new"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          New Project
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Projetos</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              className="rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="font-medium">{p.name}</div>
              <div className="mt-1 text-sm text-zinc-500">{p.cwdAlias}</div>
            </Link>
          ))}
          {projects.length === 0 && (
            <p className="col-span-2 text-sm text-zinc-400">Nenhum projeto.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Memorias Recentes</h2>
        <div className="space-y-3">
          {memories.map((m) => (
            <Link
              key={m.id}
              href={`/dashboard/memories/${m.id}`}
              className="block rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <p className="line-clamp-2 text-sm text-zinc-800">{m.content}</p>
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
          {memories.length === 0 && <p className="text-sm text-zinc-400">Nenhuma memoria.</p>}
        </div>
      </section>
    </div>
  );
}
