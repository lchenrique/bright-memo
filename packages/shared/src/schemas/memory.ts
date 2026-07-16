import { z } from 'zod';

import { projectSchema } from './project.js';

export const memoryTypeSchema = z.enum([
  'decision',
  'bug',
  'fix',
  'command',
  'file',
  'next_step',
  'observation',
  'preference',
  'architecture',
]);

export const memoryImportanceSchema = z.enum(['low', 'medium', 'high']);
export const memorySourceSchema = z.enum(['manual', 'agent', 'commit', 'file']);
export const memoryScopeSchema = z.enum(['project', 'user', 'session']);
export const memoryMetadataSchema = z.record(z.string(), z.unknown());

export const memorySchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    projectId: z.string().uuid().nullable(),
    scope: memoryScopeSchema,
    title: z.string().min(1).max(200),
    content: z.string().min(1),
    type: memoryTypeSchema,
    importance: memoryImportanceSchema,
    source: memorySourceSchema,
    tags: z.array(z.string().min(1).max(50)),
    metadata: memoryMetadataSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const memoryWithProjectSchema = memorySchema
  .extend({
    project: projectSchema,
  })
  .strict();

export type Memory = z.infer<typeof memorySchema>;
export type MemoryWithProject = z.infer<typeof memoryWithProjectSchema>;
export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type MemoryImportance = z.infer<typeof memoryImportanceSchema>;
export type MemorySource = z.infer<typeof memorySourceSchema>;
export type MemoryScope = z.infer<typeof memoryScopeSchema>;
