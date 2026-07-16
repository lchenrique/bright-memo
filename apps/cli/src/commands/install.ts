import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

export function installCommand(program: Command) {
  program
    .command('install')
    .description('one-shot install: prereqs -> infra -> API -> CLI -> validate')
    .option('--api-url <url>', 'API URL (default http://localhost:3001)')
    .option('--email <email>', 'email for dev user (default dev@brightmemo.local)')
    .option('--yes', 'skip confirmation prompts')
    .action((opts: { apiUrl?: string; email?: string; yes?: boolean }) => {
      const args = ['tsx', 'scripts/install.ts'];
      if (opts.yes) args.push('--yes');
      if (opts.apiUrl) args.push('--api-url', opts.apiUrl);
      if (opts.email) args.push('--email', opts.email);
      const result = spawnSync('pnpm', args, { stdio: 'inherit', shell: true, cwd: REPO_ROOT });
      process.exit(result.status ?? 1);
    });
}
