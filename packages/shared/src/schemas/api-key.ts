import { z } from 'zod';

import { API_KEY_SCOPES } from '../constants/scopes.js';

export const apiKeyScopeSchema = z.enum(API_KEY_SCOPES);

export const apiKeySchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    name: z.string().min(1).max(100),
    prefix: z.string().min(1).max(32),
    scopes: z.array(apiKeyScopeSchema).default([]),
    createdAt: z.string().datetime({ offset: true }),
    lastUsedAt: z.string().datetime({ offset: true }).nullable(),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export type ApiKey = z.infer<typeof apiKeySchema>;
