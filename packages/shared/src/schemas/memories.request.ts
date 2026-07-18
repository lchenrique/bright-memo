import { z } from 'zod';

import { memoryMetadataSchema, memorySourceSchema } from './memory.js';

export const createMemoryRequestSchema = z
  .object({
    projectId: z.string().uuid(),
    content: z.string().trim().min(1),
    source: memorySourceSchema.default('agent'),
    tags: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
    metadata: memoryMetadataSchema.default({}),
    embedding: z.array(z.number()).length(1536).nullable().optional(),
  })
  .strict();

export const updateMemoryRequestSchema = z
  .object({
    projectId: z.string().uuid().optional(),
    content: z.string().trim().min(1).optional(),
    source: memorySourceSchema.optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
    metadata: memoryMetadataSchema.optional(),
    embedding: z.array(z.number()).length(1536).nullable().optional(),
  })
  .strict();

export type CreateMemoryRequest = z.infer<typeof createMemoryRequestSchema>;
export type UpdateMemoryRequest = z.infer<typeof updateMemoryRequestSchema>;
