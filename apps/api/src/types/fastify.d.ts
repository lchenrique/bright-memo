/**
 * Fastify type augmentations.
 *
 * Plugins decorate `FastifyRequest` with `user`, `apiKey`, and `db`. We keep
 * the augmentation in one place so the rest of the codebase can use the
 * properties without `as` casts.
 */

import type { Db } from '../db/client.js';
import type { ApiKeyScope } from '@bright-memo/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
    };
    apiKey?: {
      id: string;
      prefix: string;
      scopes: ApiKeyScope[];
    };
    db: Db;
  }
}

export {};
