import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { apiCall } from '../lib/api.js';
import { loadConfig } from '../lib/config.js';
import { CliError } from '../lib/errors.js';

interface SyncEntry {
  content: string;
  tags?: string[];
  projectId: string;
}

interface MemoryResponse {
  id: string;
}

export function syncCommand(program: Command) {
  program
    .command('sync')
    .description('sync local memories to the API')
    .option('-f, --file <path>', 'path to JSON file with memories')
    .action(async (opts: { file?: string }) => {
      const config = loadConfig();
      if (!config.apiUrl || !config.apiKey) {
        throw new CliError('CLI not configured. Run `bm init` first.');
      }

      const filePath = opts.file ?? path.join(process.cwd(), '.bright-memo', 'memories.json');

      let entries: SyncEntry[];
      try {
        const raw = readFileSync(filePath, 'utf-8');
        entries = JSON.parse(raw) as SyncEntry[];
      } catch (err) {
        throw new CliError(`Failed to read sync file: ${(err as Error).message}`);
      }

      if (!Array.isArray(entries) || entries.length === 0) {
        console.log('No memories to sync.');
        return;
      }

      let success = 0;
      let failure = 0;

      for (const entry of entries) {
        try {
          await apiCall<MemoryResponse>('/v1/memories', {
            method: 'POST',
            body: {
              projectId: entry.projectId,
              content: entry.content,
              source: 'cli',
              tags: entry.tags ?? [],
            },
          });
          success++;
        } catch {
          failure++;
        }
      }

      console.log(`Sync complete: ${success} succeeded, ${failure} failed`);
    });
}
