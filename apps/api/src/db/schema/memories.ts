import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { projects } from './projects.js';
import { users } from './users.js';
import { vector1536 } from './types.js';

/**
 * ---------------------------------------------------------------------------
 * memories
 * ---------------------------------------------------------------------------
 * The main content table. `content` is the raw text the user saved;
 * `embedding` is the 1536-dim float vector produced by the embedding model.
 * The `source` column tells us where the memory came from (`cli-save`,
 * `commit`, `agent`, …). `tags` is a `text[]` so we can filter cheaply.
 */
export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: vector1536('embedding').notNull(),
    source: text('source').notNull().default('cli-save'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('memories_user_id_idx').on(table.userId),
    index('memories_project_created_idx').on(table.projectId, table.createdAt),
  ],
);