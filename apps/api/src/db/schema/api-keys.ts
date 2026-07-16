import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './users.js';

/**
 * ---------------------------------------------------------------------------
 * api_keys
 * ---------------------------------------------------------------------------
 * API keys the CLI / external integrations authenticate with. We never store
 * the raw key — only the argon2id hash (`key_hash`) and a short `prefix` for
 * display (e.g. `bm_abcd…`).
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    keyHash: text('key_hash').notNull().unique(),
    prefix: text('prefix').notNull(),
    name: text('name'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('api_keys_user_id_idx').on(table.userId)],
);