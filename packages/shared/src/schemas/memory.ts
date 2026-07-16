import { z } from 'zod';

export const memorySourceSchema = z.enum(['manual', 'agent', 'commit', 'file']);
export const memoryMetadataSchema = z.record(z.string(), z.unknown());

export const memorySchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    projectId: z.string().uuid(),
    content: z.string().min(1),
    source: memorySourceSchema,
    tags: z.array(z.string().min(1).max(50)),
    metadata: memoryMetadataSchema,
    embedding: z.array(z.number()).length(1536),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type Memory = z.infer<typeof memorySchema>;
export type MemorySource = z.infer<typeof memorySourceSchema>;
