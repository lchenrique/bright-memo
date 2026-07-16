import { z } from 'zod';

import { API_KEY_SCOPES } from '../constants/scopes.js';
import { userSchema } from './user.js';

export const createKeyRequestSchema = z
  .object({
    email: z.string().trim().email().max(255),
    name: z.string().trim().min(1).max(100).optional(),
    scopes: z.array(z.enum(API_KEY_SCOPES)).default([]),
  })
  .strict();

export const meResponseSchema = userSchema;

export type CreateKeyRequest = z.infer<typeof createKeyRequestSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
