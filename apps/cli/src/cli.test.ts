import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { installBrightMemorySkill, skillTargetRoot } from './commands/skill.js';
import { resolveConfig } from './lib/config.js';

test('environment variables override stored API config', () => {
  const resolved = resolveConfig(
    { apiUrl: 'https://stored.example', apiKey: 'bm_stored', defaultProject: 'repo' },
    {
      BRIGHT_MEMO_API_URL: 'https://env.example/',
      BRIGHT_MEMO_API_KEY: 'bm_env',
    },
  );

  assert.deepEqual(resolved, {
    apiUrl: 'https://env.example',
    apiKey: 'bm_env',
    defaultProject: 'repo',
  });
});

test('documented client targets are deterministic', () => {
  const home = path.join('tmp', 'home');
  assert.equal(skillTargetRoot('opencode', home), path.join(home, '.config', 'opencode', 'skills'));
  assert.equal(skillTargetRoot('codex', home), path.join(home, '.agents', 'skills'));
  assert.equal(skillTargetRoot('claude', home), path.join(home, '.claude', 'skills'));
});

test('skill installer copies complete skill into explicit temporary targets', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'bright-memory-skill-'));
  try {
    for (const client of ['opencode', 'codex', 'claude'] as const) {
      const targetRoot = path.join(temp, client);
      const result = await installBrightMemorySkill({ client, targetRoot });
      const installed = await readFile(path.join(result.path, 'SKILL.md'), 'utf8');
      assert.match(installed, /search before/i);
      assert.match(installed, /recall/i);
      assert.match(installed, /never.*secret/i);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
