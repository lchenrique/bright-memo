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
  const extension = await admin<{ installed: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed
  `;
  if (!extension[0]?.installed) throw new Error('vector extension is not installed');

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
  if ((applied[0]?.count ?? 0) < 3) throw new Error('not all database migrations were applied');
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
    console.log('[db:deploy] ensuring vector extension and application roles');
    await admin`CREATE EXTENSION IF NOT EXISTS vector`;
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
