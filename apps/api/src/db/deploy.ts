import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

const DEPLOY_LOCK_ID = 742_020;
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');
const EXPECTED_TABLES = ['api_keys', 'memories', 'projects', 'users'] as const;

loadEnv({ path: '../../.env', quiet: true });
loadEnv({ path: '../../docker/.env', quiet: true });
loadEnv({ path: '.env', quiet: true });

interface DatabaseCredentials {
  role: string;
  password: string;
}

function requiredDatabaseUrl(name: string): URL {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);

  const url = new URL(value);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`${name} must use postgres:// or postgresql://`);
  }
  if (!url.username || !url.password || !url.pathname.slice(1)) {
    throw new Error(`${name} must include user, password, and database name`);
  }
  return url;
}

function credentials(url: URL): DatabaseCredentials {
  return {
    role: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

async function ensureRole(
  admin: postgres.Sql,
  role: DatabaseCredentials,
  bypassRls: boolean,
): Promise<void> {
  const exists = await admin<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role.role}) AS exists
  `;
  const action = exists[0]?.exists ? 'ALTER' : 'CREATE';
  const bypass = bypassRls ? 'BYPASSRLS' : 'NOBYPASSRLS';
  const formatted = await admin<{ statement: string }[]>`
    SELECT format(
      ${`${action} ROLE %I LOGIN ${bypass} PASSWORD %L`}::text,
      ${role.role}::text,
      ${role.password}::text
    ) AS statement
  `;
  const statement = formatted[0]?.statement;
  if (!statement) throw new Error(`failed to prepare role ${role.role}`);
  await admin.unsafe(statement);
}

async function validateDeployment(admin: postgres.Sql): Promise<void> {
  const vectorExt = await admin<{ installed: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed
  `;
  if (!vectorExt[0]?.installed) throw new Error('vector extension is not installed');

  const trgmExt = await admin<{ installed: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS installed
  `;
  if (!trgmExt[0]?.installed) throw new Error('pg_trgm extension is not installed');

  const tables = await admin<{ name: string; rlsEnabled: boolean; rlsForced: boolean }[]>`
    SELECT
      c.relname AS name,
      c.relrowsecurity AS "rlsEnabled",
      c.relforcerowsecurity AS "rlsForced"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN ('api_keys', 'memories', 'projects', 'users')
    ORDER BY c.relname
  `;
  if (tables.length !== EXPECTED_TABLES.length) {
    throw new Error(`schema validation found ${tables.length}/${EXPECTED_TABLES.length} tables`);
  }
  for (const table of tables) {
    if (!table.rlsEnabled || !table.rlsForced) {
      throw new Error(`RLS is not enabled and forced on public.${table.name}`);
    }
  }

  const policies = await admin<{ tableName: string }[]>`
    SELECT tablename AS "tableName"
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname = 'user_all'
      AND tablename IN ('api_keys', 'memories', 'projects', 'users')
  `;
  if (new Set(policies.map((policy) => policy.tableName)).size !== EXPECTED_TABLES.length) {
    throw new Error('RLS policy validation failed');
  }

  const embeddingColumns = await admin<{ isNullable: 'YES' | 'NO' }[]>`
    SELECT is_nullable AS "isNullable"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'memories'
      AND column_name = 'embedding'
  `;
  if (embeddingColumns[0]?.isNullable !== 'YES') {
    throw new Error('memories.embedding must be nullable for model-agnostic operation');
  }

  const zeroVectors = await admin<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM memories
    WHERE embedding IS NOT NULL AND vector_norm(embedding) = 0
  `;
  if ((zeroVectors[0]?.count ?? 0) !== 0) {
    throw new Error('legacy zero-vector embeddings were not converted to NULL');
  }

  const indexes = await admin<{ name: string }[]>`
    SELECT indexname AS name
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'memories'
      AND indexname IN (
        'memories_embedding_hnsw_idx',
        'memories_content_fts_idx',
        'memories_content_trgm_idx'
      )
  `;
  const requiredIndexes = [
    'memories_embedding_hnsw_idx',
    'memories_content_fts_idx',
    'memories_content_trgm_idx',
  ];
  const indexNames = new Set(indexes.map((index) => index.name));
  const missingIndexes = requiredIndexes.filter((name) => !indexNames.has(name));
  if (missingIndexes.length > 0) {
    throw new Error(`required memory indexes are missing: ${missingIndexes.join(', ')}`);
  }

  const roles = await admin<{ roleName: string; bypassRls: boolean }[]>`
    SELECT rolname AS "roleName", rolbypassrls AS "bypassRls"
    FROM pg_roles
    WHERE rolname IN ('bright_app', 'bright_service')
  `;
  const appRole = roles.find((role) => role.roleName === 'bright_app');
  const serviceRole = roles.find((role) => role.roleName === 'bright_service');
  if (!appRole || appRole.bypassRls || !serviceRole?.bypassRls) {
    throw new Error('database role validation failed');
  }

  const applied = await admin<{ count: number }[]>`
    SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
  `;
  const migrationCount = applied[0]?.count ?? 0;
  if (migrationCount < 4) {
    throw new Error(`expected 4+ migrations through 0003, found ${migrationCount}`);
  }
}

async function main(): Promise<void> {
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`migration directory not found: ${MIGRATIONS_DIR}`);
  }

  const adminUrl = requiredDatabaseUrl('DATABASE_URL');
  const app = credentials(requiredDatabaseUrl('APP_DATABASE_URL'));
  const service = credentials(requiredDatabaseUrl('SERVICE_DATABASE_URL'));
  const adminRole = credentials(adminUrl).role;

  if (app.role !== 'bright_app' || service.role !== 'bright_service') {
    throw new Error(
      'APP_DATABASE_URL and SERVICE_DATABASE_URL must use bright_app and bright_service',
    );
  }
  if (adminRole === app.role || adminRole === service.role) {
    throw new Error('DATABASE_URL must use a separate migration/admin role');
  }

  const admin = postgres(adminUrl.toString(), { max: 1, prepare: false, onnotice: () => {} });
  let locked = false;
  try {
    await admin`SELECT pg_advisory_lock(${DEPLOY_LOCK_ID})`;
    locked = true;
    console.log('[db:deploy] ensuring vector/pg_trgm extensions and application roles');
    await admin`CREATE EXTENSION IF NOT EXISTS vector`;
    await admin`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await ensureRole(admin, app, false);
    await ensureRole(admin, service, true);

    console.log('[db:deploy] applying migrations');
    await migrate(drizzle(admin), { migrationsFolder: MIGRATIONS_DIR });

    console.log('[db:deploy] validating schema, RLS, roles, and migration journal');
    await validateDeployment(admin);
    console.log('[db:deploy] database ready');
  } finally {
    if (locked) await admin`SELECT pg_advisory_unlock(${DEPLOY_LOCK_ID})`;
    await admin.end({ timeout: 5 });
  }
}

void main().catch((error: unknown) => {
  console.error('[db:deploy] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
