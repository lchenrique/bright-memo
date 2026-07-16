/**
 * Schema barrel — re-exports every table, type, and relation defined under
 * `./schema/*`. Drizzle-kit reads this file to diff against the database and
 * generate migrations. The application imports the same module for runtime
 * queries.
 */

export { apiKeys } from './api-keys.js';
export { memories } from './memories.js';
export { projects } from './projects.js';
export { users } from './users.js';
export { vector1536 } from './types.js';
export {
  apiKeysRelations,
  memoriesRelations,
  projectsRelations,
  usersRelations,
} from './relations.js';