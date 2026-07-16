import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * ---------------------------------------------------------------------------
 * users
 * ---------------------------------------------------------------------------
 * Auth subjects. `password_hash` is nullable in v1 because the frontend auth
 * flow is being built in a later batch — users created via the API key
 * bootstrap won't have a password yet.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});