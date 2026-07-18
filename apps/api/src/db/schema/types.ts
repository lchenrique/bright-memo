/**
 * Custom Postgres column types used by the Bright Memo v2 schema.
 *
 * `vector1536` is the pgvector `vector(1536)` column used to store embeddings
 * produced by the OpenAI / Voyage / similar 1536-dim embedding model.
 */

import { customType } from 'drizzle-orm/pg-core';

export const vector1536 = customType<{
  data: number[] | null;
  driverData: string | null;
}>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[] | null): string | null {
    return value === null ? null : `[${value.join(',')}]`;
  },
  fromDriver(value: string | null): number[] | null {
    return value === null ? null : value.slice(1, -1).split(',').map(Number);
  },
});
