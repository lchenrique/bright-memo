/**
 * GET /v1/me
 *
 * Returns the authenticated user, plus counts of their projects and
 * memories so the CLI can render a quick "you have N projects, M
 * memories" header without extra round trips.
 *
 * The route uses `request.db` (the request-scoped transaction with RLS
 * context) — counts therefore only ever reflect the caller's own data.
 */

import { ERROR_CODES } from '@bright-memo/shared';
import { count, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { memories, projects, users } from '../../db/schema/index.js';

const meRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/v1/me', async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'authentication required',
        },
        requestId: req.id,
      });
    }

    const userRows = await req.db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
    const user = userRows[0];
    if (!user) {
      return reply.status(404).send({
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'user not found',
        },
        requestId: req.id,
      });
    }

    const [projectCount] = await req.db
      .select({ value: count() })
      .from(projects)
      .where(eq(projects.userId, user.id));
    const [memoryCount] = await req.db
      .select({ value: count() })
      .from(memories)
      .where(eq(memories.userId, user.id));

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      projects_count: projectCount?.value ?? 0,
      memories_count: memoryCount?.value ?? 0,
    });
  });
};

export default meRoutes;
