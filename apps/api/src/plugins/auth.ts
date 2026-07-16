/**
 * Auth plugin — global `onRequest` hook that resolves a bearer API key
 * into `request.user` and `request.apiKey`.
 *
 * Public endpoints opt out by setting `routeOptions.config.public = true`.
 * `/health` is hard-skipped because it's used by container healthchecks and
 * shouldn't even pay the cost of looking at the headers.
 *
 * The error format mirrors `@bright-memo/shared`'s `errorResponseSchema`
 * so the client always sees the same shape.
 */

import { ERROR_CODES, type ApiKeyScope } from '@bright-memo/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { serviceDb } from '../db/client.js';
import { touchKey, verifyKey } from '../services/api-keys.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    public?: boolean;
  }
}

const PUBLIC_PATHS = new Set(['/health', '/v1/health']);

function isPublic(req: FastifyRequest): boolean {
  if (req.routeOptions?.config?.public === true) return true;
  return PUBLIC_PATHS.has(req.url.split('?')[0] ?? '');
}

function unauthorized(reply: FastifyReply, requestId: string): void {
  reply.status(401).send({
    error: {
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'invalid or missing api key',
    },
    requestId,
  });
}

interface UserShape {
  id: string;
  email: string;
}

interface ApiKeyShape {
  id: string;
  prefix: string;
  scopes: ApiKeyScope[];
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Per-request symbols back the properties so each request carries its
  // own `user` / `apiKey` without sharing closures.
  const userSymbol = Symbol.for('bright-memo.request.user');
  const apiKeySymbol = Symbol.for('bright-memo.request.apiKey');
  fastify.decorateRequest('user', {
    getter(this: FastifyRequest): UserShape | undefined {
      return (this as unknown as Record<symbol, UserShape | undefined>)[userSymbol];
    },
    setter(this: FastifyRequest, value: UserShape | undefined) {
      (this as unknown as Record<symbol, UserShape | undefined>)[userSymbol] = value;
    },
  });
  fastify.decorateRequest('apiKey', {
    getter(this: FastifyRequest): ApiKeyShape | undefined {
      return (this as unknown as Record<symbol, ApiKeyShape | undefined>)[apiKeySymbol];
    },
    setter(this: FastifyRequest, value: ApiKeyShape | undefined) {
      (this as unknown as Record<symbol, ApiKeyShape | undefined>)[apiKeySymbol] = value;
    },
  });

  fastify.addHook('onRequest', async (req, reply) => {
    if (isPublic(req)) return;

    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      unauthorized(reply, req.id);
      return reply;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      unauthorized(reply, req.id);
      return reply;
    }

    // Auth lookup uses service role (BYPASSRLS). Request handlers use the
    // app role via req.db, so authenticated data reads still go through RLS.
    const result = await verifyKey(token, serviceDb).catch((err) => {
      req.log.error({ err }, 'auth: verifyKey threw');
      return null;
    });

    if (!result) {
      unauthorized(reply, req.id);
      return reply;
    }

    // Refresh last_used_at lazily. Don't block the request on it.
    void touchKey(result.apiKey.id, serviceDb);

    req.user = result.user;
    req.apiKey = { id: result.apiKey.id, prefix: result.apiKey.prefix, scopes: [] };
  });
};

export default fp(authPlugin, { name: 'auth' });
