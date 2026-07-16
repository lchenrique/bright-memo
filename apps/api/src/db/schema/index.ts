/**
 * Schema barrel — re-exports every table, enum, and relation defined under
 * `./schema/*`. Drizzle-kit reads this file to diff against the database and
 * generate migrations. The application imports the same module for runtime
 * queries.
 */

// Tables will be added here as they are introduced (users, api_keys, projects,
// memories, ...). Intentionally empty in T-008 — drizzle-kit must still be
// able to load this file.
export {};