import type { Command } from 'commander';
import { apiCall } from '../lib/api.js';
import { loadConfig } from '../lib/config.js';
import { CliError } from '../lib/errors.js';
import { printJson } from '../lib/output.js';
import { resolveProject } from '../lib/projects.js';

export function saveCommand(program: Command) {
  program
    .command('save <content>')
    .description('save a new memory')
    .option('-t, --tags <tags>', 'comma-separated tags')
    .option('-p, --project <alias>', 'project cwdAlias')
    .option('--json', 'output complete memory as one JSON value')
    .action(async (content: string, opts: { tags?: string; project?: string; json?: boolean }) => {
      const config = loadConfig();
      if (!config.apiKey) {
        throw new CliError('CLI not configured. Run `bm init` first.');
      }
      const project = await resolveProject(opts.project);

      const tags = opts.tags
        ? opts.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      const memory = await apiCall<Record<string, unknown>>('/v1/memories', {
        method: 'POST',
        body: { projectId: project.id, content, source: 'cli', tags },
      });

      if (opts.json) printJson(memory);
      else console.log(`Memory saved: ${String(memory.id)}`);
    });
}
