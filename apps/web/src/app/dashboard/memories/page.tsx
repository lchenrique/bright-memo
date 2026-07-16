import Link from 'next/link';

import type { Memory, Project } from '@bright-memo/shared';
import { apiGet } from '@/lib/server-api';
import { ProjectFilter } from '@/components/ProjectFilter';

export default async function MemoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId } = await searchParams;
  const path = projectId ? `/v1/memories?projectId=${projectId}` : '/v1/memories';
  const [memories, projects] = await Promise.all([
    apiGet<Memory[]>(path),
    apiGet<Project[]>('/v1/projects').catch(() => [] as Project[]),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Memorias</h1>
        <Link
          href="/dashboard/memories/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Nova Memoria
        </Link>
      </div>

      <ProjectFilter projects={projects} current={projectId} />

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-zinc-50">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-500">Conteudo</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Tags</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Fonte</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Data</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">
            {memories.map((m) => (
              <tr key={m.id} className="hover:bg-zinc-50">
                <td className="max-w-xs truncate px-4 py-3">{m.content}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {m.tags.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600"
                      >
                        {t}
                      </span>
                    ))}
                    {m.tags.length > 3 && (
                      <span className="text-xs text-zinc-400">+{m.tags.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">{m.source}</td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                  {new Date(m.createdAt).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/memories/${m.id}`}
                    className="text-zinc-600 hover:text-zinc-900"
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {memories.length === 0 && (
          <p className="p-6 text-center text-sm text-zinc-400">Nenhuma memoria encontrada.</p>
        )}
      </div>
    </div>
  );
}
