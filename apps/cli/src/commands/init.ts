import type { Command } from 'commander';
import { createInterface } from 'readline/promises';
import { apiCall } from '../lib/api.js';
import { loadConfig, saveConfig } from '../lib/config.js';
import { CliError } from '../lib/errors.js';

function ask(query: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return rl.question(`${query} `).finally(() => rl.close());
}

interface AuthKeysResponse {
  key: string;
  prefix: string;
  apiKeyId: string;
  user: { id: string; email: string; name: string | null };
}

interface ProjectResponse {
  id: string;
  name: string;
  cwdAlias: string;
}

export function initCommand(program: Command) {
  program
    .command('init')
    .description('setup bright-memo in this project directory')
    .option('--email <email>', 'email for API key creation')
    .option('--bootstrap-token <token>', 'bootstrap token')
    .option('--api-url <url>', 'API base URL')
    .action(async (opts: { email?: string; bootstrapToken?: string; apiUrl?: string }) => {
      const existing = loadConfig();
      if (existing.apiKey) {
        console.log('CLI is already configured. Re-run to re-configure.');
      }

      const apiUrl =
        (opts.apiUrl ?? (await ask('API URL (default http://localhost:3000):'))) ||
        'http://localhost:3000';
      saveConfig({ ...loadConfig(), apiUrl });

      const email = opts.email ?? (await ask('Email:'));
      if (!email) throw new CliError('Email is required');

      const bootstrapToken =
        opts.bootstrapToken ??
        process.env.BRIGHT_MEMO_BOOTSTRAP_TOKEN ??
        (await ask('Bootstrap token:'));
      if (!bootstrapToken) throw new CliError('Bootstrap token is required');

      const authRes = await apiCall<AuthKeysResponse>('/v1/auth/keys', {
        method: 'POST',
        headers: { 'X-Bootstrap-Token': bootstrapToken },
        body: { email },
      });

      saveConfig({ ...loadConfig(), apiKey: authRes.key });

      const me = await apiCall<{ id: string; email: string }>('/v1/me');
      console.log(`Authenticated as ${me.email}`);

      const answer = (await ask('Create a project? (y/n)')).toLowerCase();
      if (answer === 'y' || answer === 'yes') {
        const name = await ask('Project name:');
        const cwdAlias = await ask('Project alias (cwdAlias):');
        if (name && cwdAlias) {
          const project = await apiCall<ProjectResponse>('/v1/projects', {
            method: 'POST',
            body: { name, cwdAlias },
          });
          saveConfig({ ...loadConfig(), defaultProject: project.cwdAlias });
          console.log(`Project "${project.name}" created (alias: ${project.cwdAlias})`);
        }
      }

      console.log('Setup complete.');
    });
}
