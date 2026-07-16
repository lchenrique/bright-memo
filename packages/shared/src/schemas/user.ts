import { z } from 'zod';

export const userSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type User = z.infer<typeof userSchema>;
