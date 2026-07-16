import type { Command } from 'commander';
import { apiCall } from '../lib/api.js';
import { loadConfig } from '../lib/config.js';
import { CliError } from '../lib/errors.js';

interface Project {
  id: string;
  cwdAlias: string;
}

interface MemoryResponse {
  id: string;
}

export function saveCommand(program: Command) {
  program
    .command('save <content>')
    .description('save a new memory')
    .option('-t, --tags <tags>', 'comma-separated tags')
    .option('-p, --project <alias>', 'project cwdAlias')
    .action(async (content: string, opts: { tags?: string; project?: string }) => {
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

      const tags = opts.tags
        ? opts.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      const memory = await apiCall<MemoryResponse>('/v1/memories', {
        method: 'POST',
        body: { projectId: project.id, content, source: 'cli', tags },
      });

      console.log(`Memory saved: ${memory.id}`);
    });
}
