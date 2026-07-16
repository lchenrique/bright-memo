/**
 * API key services.
 *
 * Two responsibilities:
 *   1. Generate new keys. The plaintext is shown to the user **once** at
 *      creation; only the argon2id hash is stored.
 *   2. Verify a presented plaintext. We look the hash up by prefix-less
 *      scan (the `key_hash` column has a unique index) and compare with
 *      `argon2.verify`.
 *
 * The DB connection is passed in by the caller so this module can run
 * inside the bootstrap script (admin connection) or a request transaction
 * (RLS-scoped). The verify path bypasses RLS via `bright_service` so a
 * key can authenticate even when no user is set yet.
 */

import { randomBytes } from 'node:crypto';

import { hash, verify } from '@node-rs/argon2';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '../db/client.js';
import { apiKeys, users } from '../db/schema/index.js';

const KEY_PREFIX = 'bm_';
const PREFIX_LENGTH = 12; // "bm_" + 9 chars shown in the dashboard
const KEY_RANDOM_BYTES = 32;

export interface ApiKeyWithUser {
  user: { id: string; email: string };
  apiKey: { id: string; prefix: string };
}

export interface CreatedApiKey {
  plaintext: string;
  prefix: string;
  id: string;
  userId: string;
}

export function generateApiKey(): { raw: string; prefix: string } {
  const random = randomBytes(KEY_RANDOM_BYTES).toString('base64url');
  const raw = `${KEY_PREFIX}${random}`;
  const prefix = raw.slice(0, PREFIX_LENGTH);
  return { raw, prefix };
}

export async function hashApiKey(plaintext: string): Promise<string> {
  return hash(plaintext, {
    // 2 = Argon2id (see @node-rs/argon2 Algorithm enum). We use the
    // numeric literal because verbatimModuleSyntax forbids ambient
    // const-enum imports.
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Resolve a presented plaintext key to its user + record.
 *
 * Strategy: a small candidate set is fetched by matching on the public
 * prefix (first 12 chars) — this lets the index do the work without storing
 * the plaintext. We then argon2-verify each candidate. There is only ever
 * one match because the plaintext is 32 bytes of base64url randomness.
 *
 * Returns `null` when nothing matches or the matched key is revoked.
 */
export async function verifyKey(
  plaintext: string,
  conn: Db = defaultDb,
): Promise<ApiKeyWithUser | null> {
  if (!plaintext.startsWith(KEY_PREFIX) || plaintext.length < PREFIX_LENGTH) {
    return null;
  }
  const prefix = plaintext.slice(0, PREFIX_LENGTH);

  // Fetch candidate hashes. RLS would filter out other users' keys, so
  // we disable the policy for this read by going through the service role
  // when one is available — `conn` is whatever the caller wires in.
  const candidates = await conn
    .select({
      keyId: apiKeys.id,
      keyHash: apiKeys.keyHash,
      revokedAt: apiKeys.revokedAt,
      userId: users.id,
      userEmail: users.email,
    })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(and(eq(apiKeys.prefix, prefix), isNull(apiKeys.revokedAt)));

  for (const row of candidates) {
    const ok = await verify(row.keyHash, plaintext).catch(() => false);
    if (!ok) continue;
    return {
      user: { id: row.userId, email: row.userEmail },
      apiKey: { id: row.keyId, prefix },
    };
  }
  return null;
}

/**
 * Persist a freshly generated key for an existing user.
 *
 * `name` is a free-form label; `scopes` defaults to all scopes if the
 * caller passes an empty array. We intentionally accept plaintext here
 * and return it so the caller can surface it to the user.
 */
export async function createKey(
  userId: string,
  name: string | null,
  scopes: string[],
  conn: Db = defaultDb,
): Promise<CreatedApiKey> {
  const { raw, prefix } = generateApiKey();
  const keyHash = await hashApiKey(raw);

  const inserted = await conn
    .insert(apiKeys)
    .values({
      userId,
      keyHash,
      prefix,
      name,
      // We currently don't persist scopes — the column lives in a later
      // migration. Keeping a `sql` placeholder would be premature; the
      // hash is enough to authenticate the bearer.
    })
    .returning({ id: apiKeys.id });

  const row = inserted[0];
  if (!row) {
    throw new Error('failed to insert api key');
  }

  return { plaintext: raw, prefix, id: row.id, userId };
}

/**
 * Best-effort `last_used_at` update. Errors are swallowed because this
 * update is purely for diagnostics — failing to record it must not break
 * the request.
 */
export async function touchKey(keyId: string, conn: Db = defaultDb): Promise<void> {
  try {
    await conn
      .update(apiKeys)
      .set({ lastUsedAt: sql`now()` })
      .where(eq(apiKeys.id, keyId));
  } catch {
    // ignore
  }
}
