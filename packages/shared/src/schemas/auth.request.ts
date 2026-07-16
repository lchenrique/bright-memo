import { z } from 'zod';

import { API_KEY_SCOPES } from '../constants/scopes.js';
import { userSchema } from './user.js';

export const createKeyRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
  })
  .strict();

export const meResponseSchema = userSchema;

export type CreateKeyRequest = z.infer<typeof createKeyRequestSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
