import { z } from 'zod';

export const projectSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    name: z.string().min(1).max(200),
    description: z.string().nullable(),
    cwdAlias: z.string().min(1).max(255),
    remoteUrl: z.string().url().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type Project = z.infer<typeof projectSchema>;
