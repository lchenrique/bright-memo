/**
 * Database module barrel.
 *
 * Server code should import from `@bright-memo/api/db` so the drizzle client
 * can be swapped or wrapped (e.g. with logging) without touching call sites.
 */

export { db, sql, type Db } from './client.js';
export * as schema from './schema/index.js';