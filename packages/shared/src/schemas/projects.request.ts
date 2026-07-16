import { z } from 'zod';

import { memorySchema } from './memory.js';
import { projectSchema } from './project.js';

export const createProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(10_000).nullable().optional(),
    repoUrl: z.string().url().nullable().optional(),
    repoFingerprint: z.string().max(255).nullable().optional(),
    mainContext: z.string().max(100_000).optional(),
  })
  .strict();

export const projectResponseSchema = projectSchema;

export const projectContextResponseSchema = z
  .object({
    project: projectSchema,
    mainContext: z.string(),
    memories: z.array(memorySchema),
  })
  .strict();

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;
export type ProjectContextResponse = z.infer<typeof projectContextResponseSchema>;
