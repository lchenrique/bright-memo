/**
 * Destructive database reset.
 *
 * Drops the `bright_memo` database, recreates it, then deploys extensions,
 * roles, migrations, and RLS. Intended for local development only —
 * the script asks for confirmation before doing anything.
 *
 * Usage:
 *   pnpm db:reset            # interactive confirmation
 *   pnpm db:reset --yes      # skip confirmation (CI / scripted)
 */

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const COMPOSE_FILE = 'docker/docker-compose.yml';
const DB_NAME = 'bright_memo';
const DB_USER = 'bright';
const SKIP_CONFIRM = process.argv.includes('--yes') || process.argv.includes('-y');

function log(msg: string): void {
  console.log(`[db:reset] ${msg}`);
}

function dockerCompose(args: string[]): void {
  log(`docker compose ${args.join(' ')}`);
  const result = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} exited ${result.status}`);
  }
}

function execPsql(sql: string): string {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      COMPOSE_FILE,
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      DB_USER,
      '-d',
      'postgres',
      '-tAc',
      sql,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  if (result.status !== 0) {
    throw new Error(`psql failed: ${result.stderr ?? result.stdout}`);
  }
  return result.stdout.trim();
}

async function confirm(): Promise<boolean> {
  if (SKIP_CONFIRM) return true;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      `This will DROP the "${DB_NAME}" database on the local container. Continue? [y/N] `,
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const ok = await confirm();
  if (!ok) {
    log('aborted by user');
    process.exit(1);
  }

  log('ensuring the local database container is healthy');
  dockerCompose(['up', '-d', '--wait', 'db']);

  log(`terminating connections to "${DB_NAME}"`);
  execPsql(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();`,
  );
  log(`dropping and recreating database "${DB_NAME}"`);
  execPsql(`DROP DATABASE IF EXISTS "${DB_NAME}";`);
  execPsql(`CREATE DATABASE "${DB_NAME}" OWNER "${DB_USER}";`);

  log('deploying extensions, roles, migrations, and RLS');
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const deploy = spawnSync(pnpmCommand, ['db:deploy'], { stdio: 'inherit', shell: false });
  if (deploy.status !== 0) throw new Error(`pnpm db:deploy exited ${deploy.status}`);

  log('done. Run `pnpm db:bootstrap` to create the dev user + API key.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
