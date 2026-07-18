import assert from 'node:assert/strict';
import test from 'node:test';

import { searchRequestSchema, searchResponseSchema } from '../src/index.js';

test('search request normalizes query, limit, and comma-separated tags', () => {
  const parsed = searchRequestSchema.parse({
    q: '  incident response  ',
    limit: '12',
    tags: 'backend, urgent,backend',
  });

  assert.deepEqual(parsed, {
    q: 'incident response',
    limit: 12,
    tags: ['backend', 'urgent'],
  });
});

test('search response models rank metadata and rejects vector leakage', () => {
  const parsed = searchResponseSchema.parse({
    query: 'incident',
    mode: 'lexical',
    filters: {
      projectId: '2c36bc2f-5acf-47a7-9f62-2355d070e686',
      limit: 20,
      tags: ['backend'],
    },
    results: [
      {
        id: '875435eb-6532-47d9-8610-7b245d24c43f',
        userId: '4050b298-6c04-4357-9df9-a9d4fd1a4aaf',
        content: 'Restart sequence and rollback steps',
        tags: ['backend'],
        source: 'cli',
        metadata: {},
        projectId: '2c36bc2f-5acf-47a7-9f62-2355d070e686',
        createdAt: '2026-07-18T00:00:00.000Z',
        updatedAt: '2026-07-18T00:00:00.000Z',
        rank: 1,
        score: 0.88,
        match: {
          fts: true,
          trigram: false,
          substring: false,
          lexicalRank: 1,
          vectorRank: null,
        },
      },
    ],
  });

  assert.equal(parsed.results[0]?.rank, 1);
  assert.equal('embedding' in parsed.results[0]!, false);
  assert.throws(() =>
    searchResponseSchema.parse({
      ...parsed,
      results: [{ ...parsed.results[0], embedding: [0.1] }],
    }),
  );
});
