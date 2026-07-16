/**
 * POST /v1/auth/keys
 *
 * Two ways to mint a key:
 *   1. Bootstrap — first key for a brand-new user. Caller passes
 *      `X-Bootstrap-Token: $BOOTSTRAP_TOKEN_SECRET`. The handler upserts
 *      the user (idempotent on email) and mints a fresh key.
 *   2. Authenticated — caller presents a valid existing key and the
 *      handler mints an extra key for the same user.
 *
 * Returns the plaintext key **once**; the server never sees it again.
 * The response shape is the project key + the user record.
 */

import { ERROR_CODES } from '@bright-memo/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { serviceDb } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import { createKey, verifyKey } from '../../services/api-keys.js';
import { getEnv } from '../../config/env.js';

const bodySchema = z
  .object({
    email: z.string().email(),
    name: z.string().trim().min(1).max(100).optional(),
    scopes: z.array(z.string()).optional(),
  })
  .strict();

interface SuccessBody {
  key: string;
  prefix: string;
  apiKeyId: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
  };
  created: boolean;
}

function unauthorized(reply: FastifyReply, requestId: string): void {
  reply.status(401).send({
    error: {
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'invalid bootstrap token or api key',
    },
    requestId,
  });
}

async function resolveCaller(
  req: FastifyRequest,
): Promise<{ kind: 'bootstrap' } | { kind: 'auth'; userId: string } | null> {
  const bootstrap = req.headers['x-bootstrap-token'];
  if (typeof bootstrap === 'string' && bootstrap.length > 0) {
    const expected = getEnv().BOOTSTRAP_TOKEN_SECRET;
    if (bootstrap === expected) return { kind: 'bootstrap' };
  }

  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    if (!token) return null;
    const result = await verifyKey(token, serviceDb);
    if (!result) return null;
    return { kind: 'auth', userId: result.user.id };
  }

  return null;
}

const keysRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/v1/auth/keys', { config: { public: true } }, async (req, reply) => {
    const caller = await resolveCaller(req);
    if (!caller) {
      unauthorized(reply, req.id);
      return reply;
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'request body failed validation',
          details: { issues: parsed.error.issues },
        },
        requestId: req.id,
      });
    }
    const body = parsed.data;

    // Look up the user — when the caller is authenticated we already
    // know who they are and the email must match the owner.
    let userId: string;
    let created = false;
    let userEmail: string;
    let userName: string | null;
    let userCreatedAt: Date;

    if (caller.kind === 'auth') {
      const existing = await serviceDb
        .select()
        .from(users)
        .where(eq(users.id, caller.userId))
        .limit(1);
      const row = existing[0];
      if (!row) {
        return reply.status(404).send({
          error: {
            code: ERROR_CODES.NOT_FOUND,
            message: 'authenticated user no longer exists',
          },
          requestId: req.id,
        });
      }
      if (row.email !== body.email) {
        return reply.status(403).send({
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: 'email does not match authenticated user',
          },
          requestId: req.id,
        });
      }
      userId = row.id;
      userEmail = row.email;
      userName = row.name;
      userCreatedAt = row.createdAt;
    } else {
      // Bootstrap path — upsert user by email.
      const existing = await serviceDb
        .select()
        .from(users)
        .where(eq(users.email, body.email))
        .limit(1);
      const found = existing[0];
      if (found) {
        userId = found.id;
        userEmail = found.email;
        userName = found.name;
        userCreatedAt = found.createdAt;
      } else {
        const inserted = await serviceDb
          .insert(users)
          .values({ email: body.email, name: body.name ?? null })
          .returning();
        const row = inserted[0];
        if (!row) {
          return reply.status(500).send({
            error: {
              code: ERROR_CODES.SERVER_ERROR,
              message: 'failed to create user',
            },
            requestId: req.id,
          });
        }
        userId = row.id;
        userEmail = row.email;
        userName = row.name;
        userCreatedAt = row.createdAt;
        created = true;
      }
    }

    const key = await createKey(userId, body.name ?? null, body.scopes ?? [], serviceDb);

    const body_: SuccessBody = {
      key: key.plaintext,
      prefix: key.prefix,
      apiKeyId: key.id,
      user: {
        id: userId,
        email: userEmail,
        name: userName,
        createdAt: userCreatedAt.toISOString(),
      },
      created,
    };

    return reply.status(created ? 201 : 200).send(body_);
  });
};

export default keysRoutes;
