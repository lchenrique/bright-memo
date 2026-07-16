import { createProjectRequestSchema, ERROR_CODES } from '@bright-memo/shared';
import { and, desc, eq, DrizzleQueryError } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { memories, projects } from '../db/schema/index.js';

function serializeProject(row: typeof projects.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    cwdAlias: row.cwdAlias,
    remoteUrl: row.remoteUrl,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function sendNotFound(reply: FastifyReply, requestId: string) {
  return reply.status(404).send({
    error: { code: ERROR_CODES.NOT_FOUND, message: 'project not found' },
    requestId,
  });
}

function sendConflict(reply: FastifyReply, requestId: string, message: string) {
  return reply.status(409).send({
    error: { code: ERROR_CODES.CONFLICT, message },
    requestId,
  });
}

const updateProjectSchema = createProjectRequestSchema.partial().strict();

function isPgUniqueViolation(err: unknown): boolean {
  const pgCode =
    err instanceof DrizzleQueryError && err.cause
      ? (err.cause as { code?: string }).code
      : (err as { code?: string }).code;
  return pgCode === '23505';
}

const projectsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/v1/projects', async (req, reply) => {
    const rows = await req.db
      .select()
      .from(projects)
      .where(eq(projects.userId, req.user!.id))
      .orderBy(desc(projects.createdAt));

    return reply.send(rows.map(serializeProject));
  });

  fastify.post('/v1/projects', async (req, reply) => {
    const parsed = createProjectRequestSchema.safeParse(req.body);
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

    const { name, description, cwdAlias, remoteUrl, metadata } = parsed.data;

    try {
      const inserted = await req.db
        .insert(projects)
        .values({
          userId: req.user!.id,
          name,
          cwdAlias,
          description: description ?? null,
          remoteUrl: remoteUrl ?? null,
          metadata: (metadata ?? {}) as Record<string, unknown>,
        })
        .returning();

      return reply.status(201).send(serializeProject(inserted[0]!));
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        return sendConflict(reply, req.id, `a project with alias "${cwdAlias}" already exists`);
      }
      throw err;
    }
  });

  fastify.get('/v1/projects/:projectId', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };

    const rows = await req.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, req.user!.id)))
      .limit(1);

    const row = rows[0];
    if (!row) return sendNotFound(reply, req.id);

    return reply.send(serializeProject(row));
  });

  fastify.patch('/v1/projects/:projectId', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };

    const parsed = updateProjectSchema.safeParse(req.body);
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

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.cwdAlias !== undefined) updates.cwdAlias = parsed.data.cwdAlias;
    if (parsed.data.remoteUrl !== undefined) updates.remoteUrl = parsed.data.remoteUrl;
    if (parsed.data.metadata !== undefined) updates.metadata = parsed.data.metadata;
    updates.updatedAt = new Date();

    try {
      const updated = await req.db
        .update(projects)
        .set(updates)
        .where(and(eq(projects.id, projectId), eq(projects.userId, req.user!.id)))
        .returning();

      const row = updated[0];
      if (!row) return sendNotFound(reply, req.id);

      return reply.send(serializeProject(row));
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        return sendConflict(reply, req.id, 'a project with this alias already exists');
      }
      throw err;
    }
  });

  fastify.delete('/v1/projects/:projectId', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };

    const deleted = await req.db
      .delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, req.user!.id)))
      .returning({ id: projects.id });

    if (deleted.length === 0) return sendNotFound(reply, req.id);

    return reply.status(204).send();
  });

  fastify.get('/v1/projects/:projectId/context', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };

    const projectRows = await req.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, req.user!.id)))
      .limit(1);

    const project = projectRows[0];
    if (!project) return sendNotFound(reply, req.id);

    const memoryRows = await req.db
      .select()
      .from(memories)
      .where(eq(memories.projectId, projectId))
      .orderBy(desc(memories.createdAt));

    return reply.send({
      project: serializeProject(project),
      memories: memoryRows.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
    });
  });
};

export default projectsRoutes;
