import assert from 'node:assert/strict';
import test from 'node:test';

import { requestEmbeddings } from './openai.js';

test('missing provider returns null without network access', async () => {
  let called = false;
  const result = await requestEmbeddings('hello', {
    apiKey: null,
    fetchImpl: async () => {
      called = true;
      throw new Error('network must not be called');
    },
  });

  assert.equal(result, null);
  assert.equal(called, false);
});

test('provider failure degrades to null', async () => {
  const result = await requestEmbeddings('hello', {
    apiKey: 'test-key',
    maxRetries: 1,
    fetchImpl: async () => {
      throw new Error('provider unavailable');
    },
  });

  assert.equal(result, null);
});

test('provider timeout degrades to null', async () => {
  const result = await requestEmbeddings('hello', {
    apiKey: 'test-key',
    maxRetries: 1,
    timeoutMs: 5,
    fetchImpl: async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      }),
  });

  assert.equal(result, null);
});

test('valid provider response preserves 1536-dimensional embedding', async () => {
  const embedding = Array.from({ length: 1536 }, () => 0.25);
  const result = await requestEmbeddings('hello', {
    apiKey: 'test-key',
    maxRetries: 1,
    fetchImpl: async () =>
      new Response(JSON.stringify({ data: [{ index: 0, embedding }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });

  assert.deepEqual(result, [embedding]);
});
