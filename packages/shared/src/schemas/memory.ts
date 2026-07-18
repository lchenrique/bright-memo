import { z } from 'zod';

export const memorySourceSchema = z.enum(['manual', 'agent', 'commit', 'file', 'cli', 'cli-save']);
export const memoryMetadataSchema = z.record(z.string(), z.unknown());

export const searchModeSchema = z.enum(['lexical', 'hybrid']);
export type SearchMode = z.infer<typeof searchModeSchema>;

export const memorySchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    projectId: z.string().uuid(),
    content: z.string().min(1),
    source: memorySourceSchema,
    tags: z.array(z.string().min(1).max(50)),
    metadata: memoryMetadataSchema,
    embedding: z
      .array(z.number())
      .length(1536)
      .nullable()
      .describe('@deprecated Internal optional retrieval data; search responses omit it.'),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const memoryResponseSchema = memorySchema;

export const searchMemorySchema = memorySchema.omit({ embedding: true });

export const searchRequestSchema = z
  .object({
    q: z.string().trim().min(1).max(500),
    projectId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    tags: z.preprocess(
      (value) => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') return value.split(',');
        return [];
      },
      z
        .array(z.string().trim().min(1).max(50))
        .max(50)
        .transform((values) => [...new Set(values)]),
    ),
  })
  .strict();

export const searchMatchSchema = z
  .object({
    fts: z.boolean(),
    trigram: z.boolean(),
    substring: z.boolean(),
    lexicalRank: z.number().int().positive().nullable(),
    vectorRank: z.number().int().positive().nullable(),
  })
  .strict();

export const searchResultSchema = searchMemorySchema
  .extend({
    rank: z.number().int().positive(),
    score: z.number().finite().nonnegative(),
    match: searchMatchSchema,
  })
  .strict();

export const searchFiltersSchema = z
  .object({
    projectId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(100),
    tags: z.array(z.string()),
  })
  .strict();

export const searchResponseSchema = z
  .object({
    query: z.string(),
    mode: searchModeSchema,
    filters: searchFiltersSchema,
    results: z.array(searchResultSchema),
  })
  .strict();

export type Memory = z.infer<typeof memorySchema>;
export type MemoryResponse = z.infer<typeof memoryResponseSchema>;
export type MemorySource = z.infer<typeof memorySourceSchema>;
export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type SearchMatch = z.infer<typeof searchMatchSchema>;
export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
