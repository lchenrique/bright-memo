import { createMemoryRequestSchema, ERROR_CODES } from '@bright-memo/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import { memories, projects } from '../db/schema/index.js';

function serializeMemory(row: typeof memories.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    content: row.content,
    source: row.source,
    tags: row.tags,
    metadata: row.metadata as Record<string, unknown>,
    embedding: row.embedding,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function sendNotFound(reply: FastifyReply, requestId: string) {
  return reply.status(404).send({
    error: { code: ERROR_CODES.NOT_FOUND, message: 'memory not found' },
    requestId,
  });
}

const updateMemorySchema = createMemoryRequestSchema.partial().strict();

const memoriesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/v1/memories', async (req, reply) => {
    const { projectId } = req.query as { projectId?: string };

    const conditions = eq(memories.userId, req.user!.id);
    const filter = projectId ? and(conditions, eq(memories.projectId, projectId)) : conditions;

    const rows = await req.db
      .select()
      .from(memories)
      .where(filter)
      .orderBy(desc(memories.createdAt));

    return reply.send(rows.map(serializeMemory));
  });

  fastify.post('/v1/memories', async (req, reply) => {
    const parsed = createMemoryRequestSchema.safeParse(req.body);
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

    const { projectId, content, source, tags, metadata, embedding } = parsed.data;

    const inserted = await req.db
      .insert(memories)
      .values({
        userId: req.user!.id,
        projectId,
        content,
        source,
        tags,
        metadata: metadata as Record<string, unknown>,
        embedding,
      })
      .returning();

    return reply.status(201).send(serializeMemory(inserted[0]!));
  });

  fastify.get('/v1/memories/context', async (req, reply) => {
    const { projectId } = req.query as { projectId: string };

    if (!projectId) {
      return reply.status(400).send({
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'query parameter projectId is required',
        },
        requestId: req.id,
      });
    }

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
      project: {
        id: project.id,
        userId: project.userId,
        name: project.name,
        description: project.description,
        cwdAlias: project.cwdAlias,
        remoteUrl: project.remoteUrl,
        metadata: project.metadata as Record<string, unknown>,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      },
      memories: memoryRows.map(serializeMemory),
    });
  });

  fastify.get('/v1/memories/:memoryId', async (req, reply) => {
    const { memoryId } = req.params as { memoryId: string };

    const rows = await req.db
      .select()
      .from(memories)
      .where(and(eq(memories.id, memoryId), eq(memories.userId, req.user!.id)))
      .limit(1);

    const row = rows[0];
    if (!row) return sendNotFound(reply, req.id);

    return reply.send(serializeMemory(row));
  });

  fastify.patch('/v1/memories/:memoryId', async (req, reply) => {
    const { memoryId } = req.params as { memoryId: string };

    const parsed = updateMemorySchema.safeParse(req.body);
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
    if (parsed.data.projectId !== undefined) updates.projectId = parsed.data.projectId;
    if (parsed.data.content !== undefined) updates.content = parsed.data.content;
    if (parsed.data.source !== undefined) updates.source = parsed.data.source;
    if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;
    if (parsed.data.metadata !== undefined) updates.metadata = parsed.data.metadata;
    if (parsed.data.embedding !== undefined) updates.embedding = parsed.data.embedding;
    updates.updatedAt = new Date();

    const updated = await req.db
      .update(memories)
      .set(updates)
      .where(and(eq(memories.id, memoryId), eq(memories.userId, req.user!.id)))
      .returning();

    const row = updated[0];
    if (!row) return sendNotFound(reply, req.id);

    return reply.send(serializeMemory(row));
  });

  fastify.delete('/v1/memories/:memoryId', async (req, reply) => {
    const { memoryId } = req.params as { memoryId: string };

    const deleted = await req.db
      .delete(memories)
      .where(and(eq(memories.id, memoryId), eq(memories.userId, req.user!.id)))
      .returning({ id: memories.id });

    if (deleted.length === 0) return sendNotFound(reply, req.id);

    return reply.status(204).send();
  });
};

export default memoriesRoutes;
