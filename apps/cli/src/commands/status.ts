import type { Command } from 'commander';

import { apiCall } from '../lib/api.js';
import { loadConfig } from '../lib/config.js';
import { printJson } from '../lib/output.js';

interface HealthResponse {
  status: string;
  db: string;
  version: string;
  uptime: number;
}

interface MeResponse {
  user: { email: string; name: string | null };
}

export function statusCommand(program: Command): void {
  program
    .command('status')
    .description('show API health, authentication, and project configuration')
    .option('--json', 'output one JSON value')
    .action(async (options: { json?: boolean }) => {
      const config = loadConfig();
      const health = await apiCall<HealthResponse>('/health');
      const result: Record<string, unknown> = {
        apiUrl: config.apiUrl,
        apiKeyConfigured: Boolean(config.apiKey),
        defaultProject: config.defaultProject ?? null,
        health,
        auth: config.apiKey ? 'configured' : 'skipped',
      };

      if (config.apiKey) {
        const me = await apiCall<MeResponse>('/v1/me');
        result.auth = 'ok';
        result.user = me.user;
      }

      if (options.json) {
        printJson(result);
        return;
      }
      console.log(`API URL:   ${String(result.apiUrl)}`);
      console.log(`Health:    ${health.status}`);
      console.log(`DB:        ${health.db}`);
      console.log(`Version:   ${health.version}`);
      console.log(`Auth:      ${String(result.auth)}`);
      if (result.user) {
        const user = result.user as MeResponse['user'];
        console.log(`User:      ${user.name ? `${user.email} (${user.name})` : user.email}`);
      }
    });
}
