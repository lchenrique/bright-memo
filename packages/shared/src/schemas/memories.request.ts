import { z } from 'zod';

import { memoryMetadataSchema, memorySchema, memorySourceSchema } from './memory.js';

export const createMemoryRequestSchema = z
  .object({
    projectId: z.string().uuid(),
    content: z.string().trim().min(1),
    source: memorySourceSchema.default('agent'),
    tags: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
    metadata: memoryMetadataSchema.default({}),
    embedding: z.array(z.number()).length(1536).optional(),
  })
  .strict();

export const memoryResponseSchema = memorySchema;

export type CreateMemoryRequest = z.infer<typeof createMemoryRequestSchema>;
export type MemoryResponse = z.infer<typeof memoryResponseSchema>;
