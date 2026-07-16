import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const COMPOSE_FILE = join(REPO_ROOT, 'docker', 'docker-compose.yml');

const ARGS = process.argv.slice(2);
const SKIP_CONFIRM = ARGS.includes('--yes') || ARGS.includes('-y');
const REMOVE_ALL = ARGS.includes('--all');

function log(msg: string): void {
  console.log(`[install-reset] ${msg}`);
}

async function confirm(): Promise<boolean> {
  if (SKIP_CONFIRM) return true;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question('This will destroy local infra and config. Continue? [y/N] ');
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

  log('stopping docker compose and removing volumes');
  const downResult = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, 'down', '-v'], {
    stdio: 'inherit',
    shell: false,
  });
  if (downResult.status !== 0) {
    log('docker compose down -v had non-zero exit (might be expected if not running)');
  }

  const devKeyPath = join(REPO_ROOT, 'apps', 'api', '.dev-key');
  if (existsSync(devKeyPath)) {
    log('removing apps/api/.dev-key');
    rmSync(devKeyPath);
  }

  const configDir = join(homedir(), '.bright-memo');
  if (existsSync(configDir)) {
    log('removing ~/.bright-memo/');
    rmSync(configDir, { recursive: true, force: true });
  }

  if (REMOVE_ALL) {
    log('removing node_modules (--all flag)');
    const nmDirs = [
      join(REPO_ROOT, 'node_modules'),
      ...['apps', 'packages'].flatMap((dir) => {
        const full = join(REPO_ROOT, dir);
        if (!existsSync(full)) return [];
        return readdirSync(full).map((child) => join(full, child, 'node_modules'));
      }),
    ];
    for (const dir of nmDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  }

  log('done');
}

main().catch((err) => {
  console.error(`[install-reset] FAILED: ${(err as Error).message}`);
  process.exit(1);
});
