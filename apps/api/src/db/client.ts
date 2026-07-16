import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { getEnv } from '../config/env.js';

const env = getEnv();

/**
 * App-role Postgres client. This role must not have BYPASSRLS; request
 * handlers use it inside transactions with app.current_user_id set so RLS
 * policies do real isolation work.
 *
 * - `max: 10` keeps the connection pool small (one per app instance is fine).
 * - `prepare: false` disables server-side prepared statements which are
 *   incompatible with some pgvector query plans (HNSW in particular).
 */
const sql = postgres(env.APP_DATABASE_URL, {
  max: 10,
  prepare: false,
  onnotice: () => {},
});

export const db = drizzle(sql);

/** Service-role client. Only auth/bootstrap paths may use this. */
const serviceSql = postgres(env.SERVICE_DATABASE_URL, {
  max: 5,
  prepare: false,
  onnotice: () => {},
});

export const serviceDb = drizzle(serviceSql);

export type Db = typeof db;
export { serviceSql, sql };
