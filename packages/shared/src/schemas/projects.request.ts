import { z } from 'zod';

import { projectSchema } from './project.js';

export const createProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(10_000).nullable().optional(),
    cwdAlias: z.string().min(1).max(255),
    remoteUrl: z.string().url().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const projectResponseSchema = projectSchema;

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;
