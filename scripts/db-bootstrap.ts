/**
 * Database bootstrap.
 *
 * Connects as the `bright` superuser, ensures the `bright_service` role
 * exists (BYPASSRLS), creates a default dev user if missing, mints an API
 * key, and writes both the key and a JSON manifest to `apps/api/.dev-key`
 * (gitignored).
 *
 * Usage:
 *   pnpm db:bootstrap
 *
 * Re-running is safe — the user is upserted, and the script prints the
 * new key each time. Re-issue by deleting the existing `dev` key from
 * the API keys table.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hash as argon2Hash, Algorithm } from '@node-rs/argon2';
import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPS_API_DIR = join(REPO_ROOT, 'apps', 'api');
const DEV_KEY_PATH = join(APPS_API_DIR, '.dev-key');

const DEV_USER_EMAIL = 'dev@brightmemo.local';
const DEV_USER_NAME = 'Dev User';
const KEY_PREFIX = 'bm_';
const PREFIX_LENGTH = 12; // "bm_" + 9 chars shown in the dashboard
const KEY_RANDOM_BYTES = 32;

interface BootstrapResult {
  userId: string;
  apiKeyId: string;
  apiKey: string;
  prefix: string;
}

function loadConfig(): { adminUrl: string; bootstrapUrl: string } {
  loadEnv({ path: join(REPO_ROOT, '.env'), quiet: true });
  loadEnv({ path: join(REPO_ROOT, 'docker', '.env'), quiet: true });
  loadEnv({ path: join(APPS_API_DIR, '.env'), quiet: true });

  const dbPass = process.env.DB_PASS ?? 'changeme';
  const servicePass = process.env.SERVICE_DB_PASS ?? dbPass;
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const dbName = process.env.DB_NAME ?? 'bright_memo';

  const adminUrl =
    process.env.ADMIN_DATABASE_URL ??
    process.env.DATABASE_URL ??
    `postgres://bright:${dbPass}@${host}:${port}/${dbName}`;

  const bootstrapUrl =
    process.env.SERVICE_DATABASE_URL ??
    `postgres://bright_service:${servicePass}@${host}:${port}/${dbName}`;

  return { adminUrl, bootstrapUrl };
}

async function ensureServiceRole(admin: postgres.Sql, password: string): Promise<void> {
  const exists = await admin<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = 'bright_service'
    ) AS ok
  `;
  if (exists[0]?.ok) {
    return;
  }
  console.log('[bootstrap] creating bright_service role (BYPASSRLS)');
  // Quote the password to be safe; use dollar-quoting to avoid escaping.
  await admin.unsafe(`CREATE ROLE bright_service BYPASSRLS LOGIN PASSWORD $pw$${password}$pw$`);
}

async function getOrCreateUserId(
  service: postgres.Sql,
  email: string,
  name: string,
): Promise<string> {
  const existing = await service<{ id: string }[]>`
    SELECT id FROM users WHERE email = ${email}
  `;
  if (existing[0]) {
    return existing[0].id;
  }
  const inserted = await service<{ id: string }[]>`
    INSERT INTO users (email, name)
    VALUES (${email}, ${name})
    RETURNING id
  `;
  if (!inserted[0]) {
    throw new Error('failed to insert dev user');
  }
  console.log(`[bootstrap] created dev user ${email} (${inserted[0].id})`);
  return inserted[0].id;
}

function generateApiKey(): { raw: string; prefix: string } {
  const random = randomBytes(KEY_RANDOM_BYTES).toString('base64url');
  const raw = `${KEY_PREFIX}${random}`;
  const prefix = raw.slice(0, PREFIX_LENGTH);
  return { raw, prefix };
}

async function main(): Promise<void> {
  const { adminUrl, bootstrapUrl } = loadConfig();
  const servicePassword = new URL(bootstrapUrl).password;

  const admin = postgres(adminUrl, { max: 1, prepare: false });
  try {
    await ensureServiceRole(admin, servicePassword);
  } finally {
    await admin.end({ timeout: 5 });
  }

  const service = postgres(bootstrapUrl, { max: 1, prepare: false });
  let result: BootstrapResult | undefined;
  try {
    const userId = await getOrCreateUserId(service, DEV_USER_EMAIL, DEV_USER_NAME);
    const { raw, prefix } = generateApiKey();
    const keyHash = await argon2Hash(raw, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    const inserted = await service<{ id: string }[]>`
      INSERT INTO api_keys (user_id, key_hash, prefix, name)
      VALUES (${userId}, ${keyHash}, ${prefix}, ${'dev-local'})
      RETURNING id
    `;
    if (!inserted[0]) {
      throw new Error('failed to insert api key');
    }
    result = {
      userId,
      apiKeyId: inserted[0].id,
      apiKey: raw,
      prefix,
    };
  } finally {
    await service.end({ timeout: 5 });
  }

  if (!result) {
    throw new Error('bootstrap failed before generating result');
  }

  // Persist for the rest of the toolchain.
  mkdirSync(dirname(DEV_KEY_PATH), { recursive: true });
  const manifest = {
    email: DEV_USER_EMAIL,
    userId: result.userId,
    apiKeyId: result.apiKeyId,
    apiKey: result.apiKey,
    prefix: result.prefix,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(DEV_KEY_PATH, JSON.stringify(manifest, null, 2), 'utf8');

  // Best-effort chmod 600 on POSIX; no-op on Windows.
  spawnSync('chmod', ['600', DEV_KEY_PATH], { stdio: 'ignore' });

  const border = '─'.repeat(72);
  console.log('');
  console.log(border);
  console.log(' Bright Memo v2 — dev API key generated');
  console.log(border);
  console.log(` user   : ${DEV_USER_EMAIL} (${result.userId})`);
  console.log(` key    : ${result.apiKey}`);
  console.log(` prefix : ${result.prefix}`);
  console.log(` saved  : ${DEV_KEY_PATH}`);
  console.log(border);
  console.log('');
}

main().catch((err) => {
  console.error('[bootstrap] failed:', err);
  process.exit(1);
});
