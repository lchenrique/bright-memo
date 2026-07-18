import {
  createMemoryRequestSchema,
  ERROR_CODES,
  searchRequestSchema,
  updateMemoryRequestSchema,
} from '@bright-memo/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import { memories, projects } from '../db/schema/index.js';
import { fuseSearchRanks } from '../services/memory-search.js';
import { getEmbedding } from '../services/openai.js';

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

interface SearchRow {
  id: string;
  user_id: string;
  project_id: string;
  content: string;
  source: string;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

function serializeRawTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

interface LexicalRow extends SearchRow {
  lexical_rank: number;
  fts_match: boolean;
  trigram_match: boolean;
  substring_match: boolean;
}

interface VectorRow extends SearchRow {
  vector_rank: number;
}

const memoriesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/v1/memories', async (req, reply) => {
    const { projectId } = req.query as { projectId?: string };
    const owner = eq(memories.userId, req.user!.id);
    const filter = projectId ? and(owner, eq(memories.projectId, projectId)) : owner;
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

    const { projectId, content, source, tags, metadata } = parsed.data;
    const embedding =
      parsed.data.embedding !== undefined ? parsed.data.embedding : await getEmbedding(content);
    if (embedding === null) req.log.debug('embedding unavailable; saving lexical-only memory');

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

  fastify.get('/v1/memories/search', async (req, reply) => {
    const parsed = searchRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'search query failed validation',
          details: { issues: parsed.error.issues },
        },
        requestId: req.id,
      });
    }

    const { q, projectId, limit, tags } = parsed.data;
    const candidateLimit = Math.min(limit * 5, 500);
    const projectFilter = projectId ? sql`AND project_id = ${projectId}` : sql``;
    const tagsFilter =
      tags.length > 0
        ? sql`AND tags @> ARRAY[${sql.join(
            tags.map((tag) => sql`${tag}`),
            sql`, `,
          )}]::text[]`
        : sql``;

    const lexicalRows = (await req.db.execute(sql`
      WITH scored AS (
        SELECT
          id,
          user_id,
          project_id,
          content,
          source,
          tags,
          metadata,
          created_at,
          updated_at,
          to_tsvector('simple', content) @@ plainto_tsquery('simple', ${q}) AS fts_match,
          ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', ${q})) AS fts_score,
          similarity(content, ${q}) AS trigram_score,
          strpos(lower(content), lower(${q})) > 0 AS substring_match
        FROM memories
        WHERE user_id = ${req.user!.id}
          ${projectFilter}
          ${tagsFilter}
      ), ranked AS (
        SELECT
          *,
          trigram_score >= 0.08 AS trigram_match,
          row_number() OVER (
            ORDER BY
              substring_match DESC,
              fts_match DESC,
              fts_score DESC,
              trigram_score DESC,
              created_at DESC,
              id
          )::int AS lexical_rank
        FROM scored
        WHERE fts_match OR substring_match OR trigram_score >= 0.08
      )
      SELECT
        id,
        user_id,
        project_id,
        content,
        source,
        tags,
        metadata,
        created_at,
        updated_at,
        lexical_rank,
        fts_match,
        trigram_match,
        substring_match
      FROM ranked
      ORDER BY lexical_rank
      LIMIT ${candidateLimit}
    `)) as unknown as LexicalRow[];

    const embedding = await getEmbedding(q);
    let vectorRows: VectorRow[] = [];
    if (embedding) {
      const vector = `[${embedding.join(',')}]`;
      vectorRows = (await req.db.execute(sql`
        WITH ranked AS (
          SELECT
            id,
            user_id,
            project_id,
            content,
            source,
            tags,
            metadata,
            created_at,
            updated_at,
            row_number() OVER (
              ORDER BY embedding <=> ${vector}::vector, created_at DESC, id
            )::int AS vector_rank
          FROM memories
          WHERE user_id = ${req.user!.id}
            AND embedding IS NOT NULL
            ${projectFilter}
            ${tagsFilter}
        )
        SELECT *
        FROM ranked
        ORDER BY vector_rank
        LIMIT ${candidateLimit}
      `)) as unknown as VectorRow[];
    } else {
      req.log.debug('query embedding unavailable; returning lexical search');
    }

    const fused = fuseSearchRanks(
      lexicalRows.map((row) => ({ id: row.id, rank: row.lexical_rank })),
      vectorRows.map((row) => ({ id: row.id, rank: row.vector_rank })),
      limit,
    );
    const lexicalById = new Map(lexicalRows.map((row) => [row.id, row]));
    const vectorById = new Map(vectorRows.map((row) => [row.id, row]));
    const mode = vectorRows.length > 0 ? 'hybrid' : 'lexical';
    const results = fused.map((fusedRow, index) => {
      const row = lexicalById.get(fusedRow.id) ?? vectorById.get(fusedRow.id)!;
      const lexical = lexicalById.get(fusedRow.id);
      return {
        id: row.id,
        userId: row.user_id,
        projectId: row.project_id,
        content: row.content,
        source: row.source,
        tags: row.tags,
        metadata: row.metadata,
        createdAt: serializeRawTimestamp(row.created_at),
        updatedAt: serializeRawTimestamp(row.updated_at),
        rank: index + 1,
        score: fusedRow.score,
        match: {
          fts: lexical?.fts_match ?? false,
          trigram: lexical?.trigram_match ?? false,
          substring: lexical?.substring_match ?? false,
          lexicalRank: fusedRow.lexicalRank,
          vectorRank: fusedRow.vectorRank,
        },
      };
    });

    return reply.send({
      query: q,
      mode,
      filters: { projectId, limit, tags },
      results,
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
    const parsed = updateMemoryRequestSchema.safeParse(req.body);
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
    if (parsed.data.embedding !== undefined) {
      updates.embedding = parsed.data.embedding;
    } else if (parsed.data.content !== undefined) {
      updates.embedding = await getEmbedding(parsed.data.content);
    }
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
