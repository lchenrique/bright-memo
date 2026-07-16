import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';

const DEFAULT_URL = 'postgres://bright:changeme@localhost:5432/bright_memo';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? DEFAULT_URL,
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});