import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const COMPOSE_FILE = join(REPO_ROOT, 'docker', 'docker-compose.yml');
const API_ENV_PATH = join(REPO_ROOT, 'apps', 'api', '.env');
const API_ENV_EXAMPLE_PATH = join(REPO_ROOT, 'apps', 'api', '.env.example');
const DOCKER_ENV_PATH = join(REPO_ROOT, 'docker', '.env');
const DOCKER_ENV_EXAMPLE_PATH = join(REPO_ROOT, 'docker', '.env.example');
const CLI_DIST = join(REPO_ROOT, 'apps', 'cli', 'dist', 'index.js');

const ARGS = process.argv.slice(2);
const SKIP_CONFIRM = ARGS.includes('--yes') || ARGS.includes('-y');
const DRY_RUN = ARGS.includes('--dry-run');
const API_URL = extractArg('--api-url') || 'http://localhost:3001';
const EMAIL = extractArg('--email') || 'dev@brightmemo.local';

function extractArg(flag: string): string | undefined {
  const idx = ARGS.indexOf(flag);
  if (idx !== -1 && idx + 1 < ARGS.length) return ARGS[idx + 1];
  const eqIdx = ARGS.findIndex((a) => a.startsWith(`${flag}=`));
  if (eqIdx !== -1) return ARGS[eqIdx].split('=')[1];
  return undefined;
}

function log(msg: string): void {
  console.log(`[install] ${msg}`);
}

function logPhase(num: number, label: string): void {
  console.log(`\n═══ Phase ${num}: ${label} ═══`);
}

function checkCommand(cmd: string, versionFlag: string): boolean {
  try {
    execSync(`${cmd} ${versionFlag}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getNodeVersion(): number {
  try {
    const out = execSync('node --version', { encoding: 'utf8' });
    const match = out.trim().match(/^v(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

function generateEnv(): void {
  log('generating apps/api/.env from .env.example');
  const example = readFileSync(API_ENV_EXAMPLE_PATH, 'utf-8');
  const token = randomBytes(32).toString('hex');
  const env = example.replace('dev-bootstrap-replace-me', token);
  writeFileSync(API_ENV_PATH, env);
}

async function confirmOverwrite(): Promise<boolean> {
  if (SKIP_CONFIRM || DRY_RUN) return true;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`apps/api/.env already exists. Overwrite? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  if (DRY_RUN) {
    log('DRY RUN MODE — no changes will be made');
  }

  // ── Phase 1: Check prereqs ──────────────────────────────────────────
  logPhase(1, 'Check prereqs (T-037)');

  const hasDocker = checkCommand('docker', '--version');
  console.log(`  docker  ${hasDocker ? '✓' : '✗'}`);

  const nodeVer = getNodeVersion();
  const nodeOk = nodeVer >= 18;
  console.log(`  node    ${nodeOk ? '✓' : '✗'} (v${nodeVer})`);

  const hasPnpm = checkCommand('pnpm', '--version');
  console.log(`  pnpm   ${hasPnpm ? '✓' : '✗'}`);

  if (!hasDocker) {
    console.error('ERROR: docker not found. Install Docker Desktop or Rancher Desktop.');
    process.exit(1);
  }
  if (!nodeOk) {
    console.error(`ERROR: node >=18 required (found v${nodeVer}). Upgrade Node.js.`);
    process.exit(1);
  }
  if (!hasPnpm) {
    console.error('ERROR: pnpm not found. Run: npm install -g pnpm');
    process.exit(1);
  }

  // ── Phase 2: Infra up ──────────────────────────────────────────────
  logPhase(2, 'Infra up (T-038)');

  if (DRY_RUN) {
    log('[DRY-RUN] docker compose up -d');
    log('[DRY-RUN] wait for healthy (30s timeout)');
  } else {
    log('starting docker compose');
    const upResult = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d'], {
      stdio: 'inherit',
      shell: false,
    });
    if (upResult.status !== 0) {
      throw new Error('docker compose up failed');
    }

    log('waiting for healthy');
    let healthy = false;
    for (let i = 0; i < 30; i += 1) {
      const status = execSync('docker compose -f docker/docker-compose.yml ps --format json', {
        encoding: 'utf8',
      });
      if (status.includes('"Health":"healthy"')) {
        healthy = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!healthy) {
      throw new Error('docker compose did not become healthy within 30s');
    }
    log('infra is healthy');
  }

  // ── Phase 3: Init API ──────────────────────────────────────────────
  logPhase(3, 'Init API (T-039)');

  if (DRY_RUN) {
    log('[DRY-RUN] generate apps/api/.env from .env.example');
    log('[DRY-RUN] pnpm db:migrate');
    log('[DRY-RUN] pnpm db:bootstrap');
  } else {
    if (existsSync(API_ENV_PATH)) {
      const ok = await confirmOverwrite();
      if (!ok) {
        log('skipping .env overwrite, using existing');
      } else {
        generateEnv();
      }
    } else {
      generateEnv();
    }

    if (!existsSync(DOCKER_ENV_PATH)) {
      log('copying docker/.env.example → docker/.env');
      copyFileSync(DOCKER_ENV_EXAMPLE_PATH, DOCKER_ENV_PATH);
    }

    log('running db:migrate');
    execSync('pnpm db:migrate', { stdio: 'inherit', shell: true, cwd: REPO_ROOT });

    log('running db:bootstrap');
    execSync('pnpm db:bootstrap', { stdio: 'inherit', shell: true, cwd: REPO_ROOT });
  }

  // ── Phase 4: Init CLI ──────────────────────────────────────────────
  logPhase(4, 'Init CLI (T-040)');

  if (DRY_RUN) {
    log('[DRY-RUN] pnpm --filter @bright-memo/cli build');
    log('[DRY-RUN] bm init --email ... --bootstrap-token ... --api-url ...');
  } else {
    log('building CLI');
    execSync('pnpm --filter @bright-memo/cli build', {
      stdio: 'inherit',
      shell: true,
      cwd: REPO_ROOT,
    });

    const apiEnv = readFileSync(API_ENV_PATH, 'utf-8');
    const match = apiEnv.match(/^BOOTSTRAP_TOKEN_SECRET=(.+)$/m);
    const token = match?.[1] ?? '';
    if (!token) {
      throw new Error('BOOTSTRAP_TOKEN_SECRET not found in apps/api/.env');
    }

    log('running bm init');
    const bmInit = spawnSync(
      'node',
      [CLI_DIST, 'init', '--email', EMAIL, '--bootstrap-token', token, '--api-url', API_URL],
      {
        stdio: ['pipe', 'inherit', 'inherit'],
        cwd: REPO_ROOT,
      },
    );
    if (bmInit.status !== 0) {
      throw new Error(`bm init exited ${bmInit.status}`);
    }
  }

  // ── Phase 5: Validate ──────────────────────────────────────────────
  logPhase(5, 'Validate (T-042)');

  if (DRY_RUN) {
    log('[DRY-RUN] GET /health → expect 200 + db:up');
    log('[DRY-RUN] bm save "install test"');
  } else {
    log('checking health endpoint');
    try {
      const healthRes = await fetch(`${API_URL}/health`);
      const body = (await healthRes.json()) as Record<string, unknown>;
      if (body.status !== 'ok') throw new Error(`health.status = ${body.status}`);
      if (body.db !== 'up') throw new Error(`health.db = ${body.db}`);
      log(`health check OK (status=${body.status}, db=${body.db})`);
    } catch (err) {
      throw new Error(`health check failed: ${(err as Error).message}`);
    }

    log('testing bm save');
    const saveResult = spawnSync(
      'node',
      [CLI_DIST, 'save', 'install test', '--tags', 'install,test'],
      { stdio: 'inherit', cwd: REPO_ROOT },
    );
    if (saveResult.status !== 0) {
      throw new Error(`bm save exited ${saveResult.status}`);
    }
  }

  console.log('\n═══ Install complete ═══');
}

main().catch((err) => {
  console.error(`[install] FAILED: ${(err as Error).message}`);
  process.exit(1);
});
