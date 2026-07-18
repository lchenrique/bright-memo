/**
 * Health endpoint.
 *
 * Public (`config.public = true`) so it bypasses the auth plugin. The DB
 * probe is a single `SELECT 1` — we don't want to spend a full query plan
 * on liveness, but we do want to surface "container up, db unreachable"
 * distinctly from "container up, db up".
 */

import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { db } from '../db/client.js';

const startedAt = Date.now();
const VERSION = '0.2.1';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', { config: { public: true } }, async (_req, reply) => {
    let dbStatus: 'up' | 'down' = 'down';
    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = 'up';
    } catch (err) {
      fastify.log.warn({ err }, 'health: db probe failed');
    }

    const body = {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      db: dbStatus,
      version: VERSION,
      uptime: Math.round((Date.now() - startedAt) / 1000),
    };

    const statusCode = dbStatus === 'up' ? 200 : 503;
    return reply.status(statusCode).send(body);
  });
};

export default healthRoutes;
