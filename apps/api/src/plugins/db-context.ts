/**
 * DB context plugin.
 *
 * Opens a Postgres transaction for every authenticated request, sets
 * `app.current_user_id` inside it (so RLS policies resolve the owner),
 * and exposes the transaction as `request.db`. The transaction stays
 * open until the response lifecycle finishes — commit on success
 * (status < 500), rollback on server errors.
 *
 * Public routes skip this entirely; their handler can fall back to the
 * global `db` if they need to talk to the service role.
 *
 * Implementation note: we use `sql.reserve()` + manual BEGIN/COMMIT
 * instead of `db.transaction(cb)` because the latter would only return
 * when the callback resolves — which we deliberately defer until the
 * response ends. Awaiting that inside an `onRequest` hook would deadlock
 * (Fastify can't proceed to the handler until onRequest returns).
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import postgres from 'postgres';

import { db as globalDb, sql as globalSql, type Db } from '../db/client.js';

declare module 'fastify' {
  interface FastifyRequest {
    db: Db;
  }
}

interface RequestTx {
  conn: postgres.ReservedSql;
  txDb: Db;
  settled: boolean;
}

const REQ_TX_SYMBOL = Symbol.for('bright-memo.request.tx');

const dbContextPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('db', {
    getter(this: FastifyRequest): Db {
      const slot = (this as unknown as Record<symbol, RequestTx | undefined>)[REQ_TX_SYMBOL];
      return slot?.txDb ?? globalDb;
    },
    setter(this: FastifyRequest, _value: Db) {
      // The plugin owns the per-request tx; routes only read.
    },
  });

  function setTx(req: FastifyRequest, tx: RequestTx | undefined): void {
    (req as unknown as Record<symbol, RequestTx | undefined>)[REQ_TX_SYMBOL] = tx;
  }

  function getTx(req: FastifyRequest): RequestTx | undefined {
    return (req as unknown as Record<symbol, RequestTx | undefined>)[REQ_TX_SYMBOL];
  }

  async function settle(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const tx = getTx(req);
    if (!tx || tx.settled) return;
    tx.settled = true;

    const sql = tx.conn;
    try {
      if (reply.statusCode >= 500) {
        await sql`ROLLBACK`;
      } else {
        await sql`COMMIT`;
      }
    } catch (err) {
      req.log.error({ err }, 'db-context: tx settle failed; rolling back');
      try {
        await sql`ROLLBACK`;
      } catch {
        // ignore — connection may already be unusable
      }
    } finally {
      sql.release();
    }
  }

  fastify.addHook('onRequest', async (req) => {
    if (!req.user) return;

    const conn = await globalSql.reserve();
    try {
      // drizzle's postgres-js driver reads `client.options.parsers` /
      // `client.options.serializers` at construction time. `sql.reserve()`
      // returns a Sql without exposing those — share the parent's options
      // so the driver can install its transparent parsers.
      (conn as unknown as { options: unknown }).options = (
        globalSql as unknown as { options: unknown }
      ).options;

      await conn`BEGIN`;
      await conn`SELECT set_config('app.current_user_id', ${req.user.id}, true)`;
      setTx(req, { conn, txDb: drizzle(conn), settled: false });
    } catch (err) {
      try {
        await conn`ROLLBACK`;
      } catch {
        // ignore
      }
      conn.release();
      throw err;
    }
  });

  fastify.addHook('onResponse', async (req, reply) => {
    await settle(req, reply);
  });

  fastify.addHook('onError', async (req, _reply, err) => {
    const tx = getTx(req);
    if (!tx || tx.settled) return;
    tx.settled = true;
    try {
      await tx.conn`ROLLBACK`;
    } catch {
      // ignore
    } finally {
      tx.conn.release();
    }
    req.log.warn({ err }, 'db-context: rolled back on error');
  });
};

export default fp(dbContextPlugin, { name: 'db-context' });
