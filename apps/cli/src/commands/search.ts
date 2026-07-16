import type { Command } from 'commander';
import { apiCall } from '../lib/api.js';

interface SearchResult {
  content: string;
  tags: string[];
  similarity: number;
  createdAt: string;
}

interface SearchResponse {
  results: SearchResult[];
  query: string;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '\u2026';
}

export function searchCommand(program: Command) {
  program
    .command('search <query>')
    .description('search memories using semantic + full-text search')
    .option('-l, --limit <number>', 'max results')
    .action(async (query: string, opts: { limit?: string }) => {
      const encoded = encodeURIComponent(query);
      const data = await apiCall<SearchResponse>(`/v1/memories/search?q=${encoded}`);

      const limit = opts.limit ? parseInt(opts.limit, 10) : data.results.length;
      const page = data.results.slice(0, limit);

      if (page.length === 0) {
        console.log('No results found.');
        return;
      }

      console.log('');
      page.forEach((r, i) => {
        const rank = String(i + 1).padStart(3);
        const sim = `${(r.similarity * 100).toFixed(1)}%`.padStart(7);
        const content = truncate(r.content, 120).padEnd(122);
        const tags = (r.tags ?? []).join(',').slice(0, 20).padEnd(22);
        const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-';
        console.log(`${rank}  ${sim}  ${content} ${tags} ${date}`);
      });
    });
}
