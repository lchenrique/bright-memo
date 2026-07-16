'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Memory, Project } from '@bright-memo/shared';

export default function EditMemoryPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [content, setContent] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;

    Promise.all([
      fetch(`/api/api-proxy/memories/${id}`).then((r) => r.json()),
      fetch('/api/api-proxy/projects').then((r) => r.json()),
    ])
      .then(([memData, projData]) => {
        const m = memData as Memory;
        setProjectId(m.projectId);
        setContent(m.content);
        setTagsStr(m.tags.join(', '));
        if (Array.isArray(projData)) setProjects(projData as Project[]);
        setLoaded(true);
      })
      .catch(() => setError('Falha ao carregar memoria'));
  }, [id]);

  async function handleUpdate(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError('');
    setLoading(true);

    const tags = tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/api-proxy/memories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, content, tags }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Erro ao atualizar');
        return;
      }

      router.push('/dashboard/memories');
    } catch {
      setError('Erro de conexao');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm('Tem certeza?')) return;
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`/api/api-proxy/memories/${id}`, { method: 'DELETE' });

      if (!res.ok) {
        setError('Erro ao excluir');
        return;
      }

      router.push('/dashboard/memories');
    } catch {
      setError('Erro de conexao');
    } finally {
      setLoading(false);
    }
  }

  if (!loaded) return <div className="p-8 text-sm text-zinc-400">Carregando...</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <h1 className="text-2xl font-bold">Editar Memoria</h1>

      <form onSubmit={handleUpdate} className="space-y-4">
        <div>
          <label htmlFor="project" className="block text-sm font-medium text-zinc-700">
            Projeto
          </label>
          <select
            id="project"
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          >
            <option value="">Selecione...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="content" className="block text-sm font-medium text-zinc-700">
            Conteudo
          </label>
          <textarea
            id="content"
            required
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="tags" className="block text-sm font-medium text-zinc-700">
            Tags (separadas por virgula)
          </label>
          <input
            id="tags"
            type="text"
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Excluir
          </button>
        </div>
      </form>
    </div>
  );
}
