import Link from 'next/link';

import type { Project } from '@bright-memo/shared';
import { apiGet } from '@/lib/server-api';

export default async function ProjectsPage() {
  const projects = await apiGet<Project[]>('/v1/projects');

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projetos</h1>
        <Link
          href="/dashboard/projects/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Novo Projeto
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-zinc-50">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-500">Nome</th>
              <th className="px-4 py-3 font-medium text-zinc-500">CWD</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Remote</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Criado</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">
            {projects.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-zinc-500">{p.cwdAlias}</td>
                <td className="max-w-[200px] truncate px-4 py-3 text-zinc-500">
                  {p.remoteUrl ?? '—'}
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/projects/${p.id}`}
                    className="text-zinc-600 hover:text-zinc-900"
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {projects.length === 0 && (
          <p className="p-6 text-center text-sm text-zinc-400">Nenhum projeto encontrado.</p>
        )}
      </div>
    </div>
  );
}
