import { createInterface } from 'node:readline/promises';
import type { Command } from 'commander';

import { apiCall } from '../lib/api.js';
import { loadStoredConfig, saveConfig } from '../lib/config.js';
import { CliError } from '../lib/errors.js';
import { printJson } from '../lib/output.js';

function ask(query: string): Promise<string> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  return readline.question(`${query} `).finally(() => readline.close());
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

interface InitOptions {
  email?: string;
  bootstrapToken?: string;
  apiUrl?: string;
  projectName?: string;
  projectAlias?: string;
  skipProject?: boolean;
  json?: boolean;
}

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('configure Bright Memo auth and optional default project')
    .option('--email <email>', 'email for Bright API key creation')
    .option('--bootstrap-token <token>', 'Bright bootstrap token')
    .option('--api-url <url>', 'API base URL')
    .option('--project-name <name>', 'project name for non-interactive setup')
    .option('--project-alias <alias>', 'project alias for non-interactive setup')
    .option('--skip-project', 'configure auth without creating a project')
    .option('--json', 'non-interactive mode with one JSON response')
    .action(async (options: InitOptions) => {
      const stored = loadStoredConfig();
      const apiUrlInput =
        options.apiUrl ??
        (options.json ? undefined : await ask('API URL (default http://localhost:3001):'));
      const apiUrl = (apiUrlInput?.trim() || 'http://localhost:3001').replace(/\/+$/, '');
      const email = options.email ?? (options.json ? undefined : await ask('Email:'));
      const bootstrapToken =
        options.bootstrapToken ??
        process.env.BRIGHT_MEMO_BOOTSTRAP_TOKEN ??
        (options.json ? undefined : await ask('Bootstrap token:'));

      if (!email) throw new CliError('Email is required');
      if (!bootstrapToken) throw new CliError('Bootstrap token is required');
      saveConfig({ ...stored, apiUrl });

      const auth = await apiCall<AuthKeysResponse>('/v1/auth/keys', {
        method: 'POST',
        headers: { 'X-Bootstrap-Token': bootstrapToken },
        body: { email },
      });
      saveConfig({ ...loadStoredConfig(), apiKey: auth.key });
      const me = await apiCall<{ user: AuthKeysResponse['user'] }>('/v1/me');

      let project: ProjectResponse | null = null;
      let projectName = options.projectName;
      let projectAlias = options.projectAlias;
      if (!options.skipProject && !options.json && !projectName && !projectAlias) {
        const create = (await ask('Create a project? (y/n)')).toLowerCase();
        if (create === 'y' || create === 'yes') {
          projectName = await ask('Project name:');
          projectAlias = await ask('Project alias (cwdAlias):');
        }
      }
      if ((projectName && !projectAlias) || (!projectName && projectAlias)) {
        throw new CliError('--project-name and --project-alias must be provided together');
      }
      if (projectName && projectAlias) {
        project = await apiCall<ProjectResponse>('/v1/projects', {
          method: 'POST',
          body: { name: projectName, cwdAlias: projectAlias },
        });
        saveConfig({ ...loadStoredConfig(), defaultProject: project.cwdAlias });
      }

      const result = {
        apiUrl,
        authenticated: true,
        user: me.user,
        keyPrefix: auth.prefix,
        project,
      };
      if (options.json) printJson(result);
      else {
        console.log(`Authenticated as ${me.user.email}`);
        if (project) console.log(`Project "${project.name}" created (alias: ${project.cwdAlias})`);
        console.log('Setup complete.');
      }
    });
}
