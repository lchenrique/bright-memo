/**
 * DB context plugin.
 *
 * Opens a Postgres transaction for every authenticated request, sets
 * `app.current_user_id` inside it (so RLS policies resolve the owner),
 * and exposes the transaction as `request.db`. The transaction stays
 * open until the response stream closes, then commits — if the route
 * handler threw, the transaction rolls back and we never persist a
 * half-applied change.
 *
 * Public routes skip this entirely; their handler can fall back to the
 * global `db` if they need to talk to the service role.
 */

import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { db, type Db } from '../db/client.js';

declare module 'fastify' {
  interface FastifyRequest {
    db: Db;
  }
}

const dbContextPlugin: FastifyPluginAsync = async (fastify) => {
  // Fastify 5 forbids reference-type decorators via plain values. The
  // getter/setter pair is invoked per request, so each request keeps its
  // own slot via the symbol stored on `this`.
  const dbSymbol = Symbol.for('bright-memo.request.db');
  fastify.decorateRequest('db', {
    getter(this: FastifyRequest) {
      return (this as unknown as Record<symbol, Db>)[dbSymbol] ?? db;
    },
    setter(this: FastifyRequest, value: Db) {
      (this as unknown as Record<symbol, Db>)[dbSymbol] = value;
    },
  });

  fastify.addHook('onRequest', async (req) => {
    // No user => public route. The handler can use the global `db` if
    // it needs to bypass RLS (e.g. /v1/auth/keys during onboarding).
    if (!req.user) return;

    // Hold the transaction open until the response finishes streaming.
    // The callback resolves on response end, then the transaction commits.
    // Any thrown error from the route bubbles up and the tx rolls back.
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_user_id', ${req.user!.id}, true)`);
      req.db = tx as unknown as Db;

      await new Promise<void>((resolve) => {
        const done = (): void => {
          req.raw.off('end', done);
          req.raw.off('close', done);
          req.raw.off('error', done);
          resolve();
        };
        req.raw.on('end', done);
        req.raw.on('close', done);
        req.raw.on('error', done);
      });
    });
  });
};

export default fp(dbContextPlugin, { name: 'db-context' });
