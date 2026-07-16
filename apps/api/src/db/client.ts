import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const DEFAULT_URL = 'postgres://bright:changeme@localhost:5432/bright_memo';

const connectionUrl = process.env.DATABASE_URL ?? DEFAULT_URL;

/**
 * Postgres-js client. Tuned for pgvector workloads:
 * - `max: 10` keeps the connection pool small (one per app instance is fine).
 * - `prepare: false` disables server-side prepared statements which are
 *   incompatible with some pgvector query plans (HNSW in particular).
 */
const sql = postgres(connectionUrl, {
  max: 10,
  prepare: false,
  onnotice: () => {},
});

export const db = drizzle(sql);

export type Db = typeof db;
export { sql };