import { z } from 'zod';

export const projectStatusSchema = z.enum(['active', 'archived']);

export const projectSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    name: z.string().min(1).max(200),
    description: z.string().nullable(),
    repoUrl: z.string().url().nullable(),
    repoFingerprint: z.string().nullable(),
    mainContext: z.string(),
    status: projectStatusSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type Project = z.infer<typeof projectSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
