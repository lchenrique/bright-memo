import type { SearchResponse } from '@bright-memo/shared';
import type { Command } from 'commander';

import { apiCall } from '../lib/api.js';
import { CliError } from '../lib/errors.js';
import { positiveInteger, printJson } from '../lib/output.js';
import { resolveProject } from '../lib/projects.js';

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}\u2026`;
}

export function searchCommand(program: Command): void {
  program
    .command('search <query>')
    .description('search project memories with lexical retrieval and optional hybrid ranking')
    .option('-p, --project <alias-or-id>', 'project alias or UUID')
    .option('-l, --limit <number>', 'max results', '20')
    .option('-t, --tags <tags>', 'comma-separated required tags')
    .option('--json', 'output complete response as one JSON value')
    .action(
      async (
        query: string,
        options: { project?: string; limit?: string; tags?: string; json?: boolean },
      ) => {
        const project = await resolveProject(options.project);
        const limit = positiveInteger(options.limit, 20, 'limit');
        if (limit < 1 || limit > 100) throw new CliError('limit must be between 1 and 100');

        const params = new URLSearchParams({
          q: query,
          projectId: project.id,
          limit: String(limit),
        });
        if (options.tags) params.set('tags', options.tags);
        const response = await apiCall<SearchResponse>(`/v1/memories/search?${params.toString()}`);

        if (options.json) {
          printJson(response);
          return;
        }

        console.log(`Mode: ${response.mode}`);
        if (response.results.length === 0) {
          console.log('No results found.');
          return;
        }
        for (const result of response.results) {
          const rank = String(result.rank).padStart(3);
          const score = result.score.toFixed(6).padStart(10);
          const content = truncate(result.content, 120);
          console.log(`${rank}  ${score}  ${content}`);
        }
      },
    );
}
