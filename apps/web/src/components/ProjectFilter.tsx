'use client';

import { useRouter } from 'next/navigation';

type Project = { id: string; name: string };

export function ProjectFilter({ projects, current }: { projects: Project[]; current?: string }) {
  const router = useRouter();

  return (
    <select
      defaultValue={current ?? ''}
      onChange={(e) => {
        const url = new URL(window.location.href);
        if (e.target.value) url.searchParams.set('projectId', e.target.value);
        else url.searchParams.delete('projectId');
        router.push(url.href);
      }}
      className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none"
    >
      <option value="">Todos os projetos</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
