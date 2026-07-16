import Link from 'next/link';

import type { Project, Memory } from '@bright-memo/shared';
import { apiGet } from '@/lib/server-api';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, memories] = await Promise.all([
    apiGet<Project>(`/v1/projects/${id}`),
    apiGet<Memory[]>(`/v1/memories?projectId=${id}`).catch(() => [] as Memory[]),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">{project.cwdAlias}</p>
        </div>
        <Link
          href={`/dashboard/memories/new?projectId=${project.id}`}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Nova Memoria
        </Link>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Detalhes</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="w-28 font-medium text-zinc-500">ID:</dt>
            <dd className="font-mono text-xs">{project.id}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 font-medium text-zinc-500">Remote:</dt>
            <dd>{project.remoteUrl ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 font-medium text-zinc-500">Descricao:</dt>
            <dd>{project.description ?? '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 font-medium text-zinc-500">Criado:</dt>
            <dd>{new Date(project.createdAt).toLocaleDateString('pt-BR')}</dd>
          </div>
        </dl>
        {project.metadata && Object.keys(project.metadata).length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium text-zinc-500">Metadata</h3>
            <pre className="overflow-auto rounded-lg bg-zinc-50 p-3 text-xs">
              {JSON.stringify(project.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Memorias ({memories.length})</h2>
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
          {memories.length === 0 && (
            <p className="text-sm text-zinc-400">Nenhuma memoria neste projeto.</p>
          )}
        </div>
      </section>
    </div>
  );
}
