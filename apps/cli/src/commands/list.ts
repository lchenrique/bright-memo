import type { Command } from 'commander';
import { apiCall } from '../lib/api.js';
import { loadConfig } from '../lib/config.js';
import { CliError } from '../lib/errors.js';

interface Project {
  id: string;
  cwdAlias: string;
}

interface Memory {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '\u2026';
}

export function listCommand(program: Command) {
  program
    .command('list')
    .description('list memories')
    .option('-p, --project <alias>', 'project cwdAlias')
    .option('--limit <number>', 'max results')
    .option('--offset <number>', 'result offset')
    .action(async (opts: { project?: string; limit?: string; offset?: string }) => {
      const config = loadConfig();
      if (!config.apiUrl || !config.apiKey) {
        throw new CliError('CLI not configured. Run `bm init` first.');
      }

      const projectAlias = opts.project ?? config.defaultProject;
      if (!projectAlias) {
        throw new CliError('No project specified. Use --project or set defaultProject in config.');
      }

      const res = await apiCall<unknown>('/v1/projects');
      const projects: Project[] = Array.isArray(res)
        ? (res as Project[])
        : (res as { data: Project[] }).data;

      const project = projects.find((p) => p.cwdAlias === projectAlias);
      if (!project) {
        throw new CliError(`Project "${projectAlias}" not found.`);
      }

      const memRes = await apiCall<unknown>(`/v1/memories?projectId=${project.id}`);
      const memories: Memory[] = Array.isArray(memRes)
        ? (memRes as Memory[])
        : (memRes as { data: Memory[] }).data;

      const limit = opts.limit ? parseInt(opts.limit, 10) : memories.length;
      const offset = opts.offset ? parseInt(opts.offset, 10) : 0;
      const page = memories.slice(offset, offset + limit);

      if (page.length === 0) {
        console.log('No memories found.');
        return;
      }

      console.log('');
      page.forEach((m, i) => {
        const idx = String(offset + i + 1).padStart(3);
        const content = truncate(m.content, 50).padEnd(52);
        const tags = (m.tags ?? []).join(',').slice(0, 18).padEnd(20);
        const createdAt = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '-';
        console.log(`${idx}  ${content} ${tags} ${createdAt}`);
      });
    });
}
