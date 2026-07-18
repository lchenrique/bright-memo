import assert from 'node:assert/strict';
import test from 'node:test';

import { fuseSearchRanks } from './memory-search.js';

test('lexical-only fusion preserves lexical order', () => {
  const fused = fuseSearchRanks(
    [
      { id: 'first', rank: 1 },
      { id: 'second', rank: 2 },
    ],
    [],
    10,
  );

  assert.deepEqual(
    fused.map(({ id, lexicalRank, vectorRank }) => ({ id, lexicalRank, vectorRank })),
    [
      { id: 'first', lexicalRank: 1, vectorRank: null },
      { id: 'second', lexicalRank: 2, vectorRank: null },
    ],
  );
  assert.ok(fused[0]!.score > fused[1]!.score);
});

test('hybrid fusion combines rank positions instead of raw scores', () => {
  const fused = fuseSearchRanks(
    [
      { id: 'lexical-only', rank: 1 },
      { id: 'both', rank: 2 },
    ],
    [
      { id: 'both', rank: 1 },
      { id: 'vector-only', rank: 2 },
    ],
    10,
  );

  assert.equal(fused[0]!.id, 'both');
  assert.equal(fused[0]!.lexicalRank, 2);
  assert.equal(fused[0]!.vectorRank, 1);
  assert.ok(fused[0]!.score > fused[1]!.score);
});
