import { z } from 'zod';

export const errorDetailsSchema = z.record(z.string(), z.unknown());

export const errorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        details: errorDetailsSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
