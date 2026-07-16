import { relations } from 'drizzle-orm';

import { apiKeys } from './api-keys.js';
import { memories } from './memories.js';
import { projects } from './projects.js';
import { users } from './users.js';

export const usersRelations = relations(users, ({ many }) => ({
  apiKeys: many(apiKeys),
  projects: many(projects),
  memories: many(memories),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  memories: many(memories),
}));

export const memoriesRelations = relations(memories, ({ one }) => ({
  user: one(users, { fields: [memories.userId], references: [users.id] }),
  project: one(projects, {
    fields: [memories.projectId],
    references: [projects.id],
  }),
}));