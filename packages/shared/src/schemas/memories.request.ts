import { z } from 'zod';

import {
  memoryImportanceSchema,
  memoryMetadataSchema,
  memorySchema,
  memoryScopeSchema,
  memorySourceSchema,
  memoryTypeSchema,
} from './memory.js';

export const createMemoryRequestSchema = z
  .object({
    projectId: z.string().uuid().nullable().optional(),
    scope: memoryScopeSchema.default('project'),
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1),
    type: memoryTypeSchema,
    importance: memoryImportanceSchema.default('medium'),
    source: memorySourceSchema.default('agent'),
    tags: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
    metadata: memoryMetadataSchema.default({}),
  })
  .strict();

export const memoryResponseSchema = memorySchema;

export const searchQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    projectId: z.string().uuid().optional(),
    type: memoryTypeSchema.optional(),
    scope: memoryScopeSchema.optional(),
    importance: memoryImportanceSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    tokenBudget: z.coerce.number().int().min(1).max(50_000).default(4_000),
  })
  .strict();

export type CreateMemoryRequest = z.infer<typeof createMemoryRequestSchema>;
export type MemoryResponse = z.infer<typeof memoryResponseSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
