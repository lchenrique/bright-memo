/**
 * Destructive database reset.
 *
 * Drops the `bright_memo` database, recreates it, and re-applies every
 * migration from `apps/api/drizzle`. Intended for local development only —
 * the script asks for confirmation before doing anything.
 *
 * Usage:
 *   pnpm db:reset            # interactive confirmation
 *   pnpm db:reset --yes      # skip confirmation (CI / scripted)
 */

import { execSync, spawnSync } from 'node:child_process';
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

  log('stopping db container (so we can drop the DB cleanly)');
  dockerCompose(['stop', 'db']);

  log(`dropping database "${DB_NAME}" if it exists`);
  try {
    execPsql(`DROP DATABASE IF EXISTS "${DB_NAME}";`);
  } catch (err) {
    log(`drop failed (might already be gone): ${(err as Error).message}`);
  }

  log('starting db container (this re-runs /docker-entrypoint-initdb.d)');
  dockerCompose(['up', '-d', 'db']);

  log('waiting for healthy');
  for (let i = 0; i < 30; i += 1) {
    const status = execSync('docker compose -f docker/docker-compose.yml ps --format json', {
      encoding: 'utf8',
    });
    if (status.includes('"Health":"healthy"')) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  log('running migrations');
  execSync('pnpm --filter @bright-memo/api drizzle-kit migrate', {
    stdio: 'inherit',
    shell: true,
  });

  log('done. Run `pnpm db:bootstrap` to create the dev user + API key.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});