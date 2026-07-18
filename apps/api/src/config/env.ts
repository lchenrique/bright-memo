/**
 * Environment configuration loader.
 *
 * Validates `process.env` against a Zod schema and returns a frozen object
 * the rest of the app imports. The loader runs once at boot — if a required
 * variable is missing or malformed the process exits with a non-zero code
 * and a clear error so we never start in a half-configured state.
 */

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    PORT: z.coerce.number().int().positive().default(3001),

    // CORS — accept a single origin or comma-separated list. Empty string
    // means "no CORS"; only useful in tests.
    APP_URL: z.string().transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),

    DATABASE_URL: z.string().url(),
    APP_DATABASE_URL: z.string().url(),
    SERVICE_DATABASE_URL: z.string().url(),

    OPENAI_API_KEY: z.string().min(1).optional(),

    BOOTSTRAP_TOKEN_SECRET: z.string().min(32),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      [
        'dev-bootstrap-secret-replace-me-please-32',
        'REPLACE_WITH_RANDOM_32_PLUS_CHARACTER_SECRET',
      ].includes(env.BOOTSTRAP_TOKEN_SECRET)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BOOTSTRAP_TOKEN_SECRET'],
        message: 'must not use a documented placeholder in production',
      });
    }
  });

const developmentDefaults = {
  APP_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgres://bright:changeme@localhost:5432/bright_memo',
  APP_DATABASE_URL: 'postgres://bright_app:changeme@localhost:5432/bright_memo',
  SERVICE_DATABASE_URL: 'postgres://bright_service:changeme@localhost:5432/bright_memo',
  BOOTSTRAP_TOKEN_SECRET: 'dev-bootstrap-secret-replace-me-please-32',
};

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

function loadFromDisk(): void {
  // Same search order as the bootstrap script: repo root, then api dir.
  // `dotenv` never overwrites an existing variable, so production env wins.
  loadEnv({ path: '.env', quiet: true });
  loadEnv({ path: '.env.local', quiet: true });
  loadEnv({ path: '../../.env', quiet: true });
  loadEnv({ path: '../../docker/.env', quiet: true });
}

function parseEnv(): Env {
  const input =
    process.env.NODE_ENV === 'production'
      ? process.env
      : { ...developmentDefaults, ...process.env };
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    console.error(`[env] invalid configuration:\n${issues}`);
    process.exit(1);
  }
  return Object.freeze(parsed.data);
}

/**
 * Resolve the current environment. Idempotent — subsequent calls return the
 * cached object.
 */
export function getEnv(): Env {
  if (cached) return cached;
  loadFromDisk();
  cached = parseEnv();
  return cached;
}
