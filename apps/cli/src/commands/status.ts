import type { Command } from 'commander';
import { apiCall } from '../lib/api.js';
import { loadConfig } from '../lib/config.js';

interface HealthResponse {
  status: string;
  db: string;
  version: string;
  uptime: number;
}

interface MeResponse {
  email: string;
  name: string | null;
}

export function statusCommand(program: Command) {
  program
    .command('status')
    .description('show API health and system status')
    .action(async () => {
      const config = loadConfig();

      console.log(`API URL:   ${config.apiUrl ?? '(not set)'}`);
      console.log(`API Key:   ${config.apiKey ? 'configured' : '(not set)'}`);

      if (!config.apiUrl) {
        return;
      }

      try {
        const health = await apiCall<HealthResponse>('/health');
        console.log(`Health:    ${health.status}`);
        console.log(`DB:        ${health.db}`);
        console.log(`Version:   ${health.version}`);
        console.log(`Uptime:    ${health.uptime}s`);
      } catch (err) {
        console.log(`Health:    unreachable (${(err as Error).message})`);
        return;
      }

      if (!config.apiKey) {
        console.log('Auth:     skipped — no API key configured');
        return;
      }

      try {
        const me = await apiCall<MeResponse>('/v1/me');
        const displayName = me.name ? `${me.email} (${me.name})` : me.email;
        console.log(`User:      ${displayName}`);
      } catch {
        console.log('Auth:     failed — check your API key');
      }
    });
}
