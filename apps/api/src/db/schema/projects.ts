import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './users.js';

/**
 * ---------------------------------------------------------------------------
 * projects
 * ---------------------------------------------------------------------------
 * A project maps a CLI workspace (identified by `cwd_alias`) to a logical
 * container of memories. `(user_id, cwd_alias)` is unique so the same alias
 * can't be claimed twice by the same user.
 */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    cwdAlias: text('cwd_alias').notNull(),
    description: text('description'),
    remoteUrl: text('remote_url'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('projects_user_cwd_alias_idx').on(table.userId, table.cwdAlias),
    index('projects_cwd_alias_idx').on(table.cwdAlias),
  ],
);