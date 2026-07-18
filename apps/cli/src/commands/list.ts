import type { Command } from 'commander';
import { apiCall } from '../lib/api.js';
import { loadConfig } from '../lib/config.js';
import { CliError } from '../lib/errors.js';
import { positiveInteger, printJson } from '../lib/output.js';
import { resolveProject } from '../lib/projects.js';

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
    .option('--json', 'output complete results as one JSON value')
    .action(async (opts: { project?: string; limit?: string; offset?: string; json?: boolean }) => {
      const config = loadConfig();
      if (!config.apiKey) {
        throw new CliError('CLI not configured. Run `bm init` first.');
      }
      const project = await resolveProject(opts.project);

      const memRes = await apiCall<unknown>(`/v1/memories?projectId=${project.id}`);
      const memories: Memory[] = Array.isArray(memRes)
        ? (memRes as Memory[])
        : (memRes as { data: Memory[] }).data;

      const limit = positiveInteger(opts.limit, memories.length, 'limit');
      const offset = positiveInteger(opts.offset, 0, 'offset');
      const page = memories.slice(offset, offset + limit);

      if (opts.json) {
        printJson({ project, limit, offset, results: page });
        return;
      }

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
