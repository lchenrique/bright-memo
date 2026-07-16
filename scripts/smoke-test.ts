#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';

const DEFAULTS = {
  'api-url': 'http://localhost:3001',
  'cli-path': resolve(import.meta.dirname, '..', 'apps', 'cli', 'dist', 'index.js'),
};

function parseFlags() {
  const { values } = parseArgs({
    options: {
      'api-url': { type: 'string', default: DEFAULTS['api-url'] },
      'cli-path': { type: 'string', default: DEFAULTS['cli-path'] },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    console.log(`Usage: smoke-test [options]

Options:
  --api-url <url>     API base URL (default: ${DEFAULTS['api-url']})
  --cli-path <path>   CLI binary path (default: ${DEFAULTS['cli-path']})
  --help              Show this help`);
    process.exit(0);
  }
  return { apiUrl: values['api-url'], cliPath: values['cli-path'] };
}

async function apiCheck(label: string, url: string, init?: RequestInit): Promise<boolean> {
  try {
    const r = await fetch(url, init);
    const pass = init?.headers?.['authorization']
      ? r.status === 200
      : r.status === (init?.method === 'POST' ? 201 : 200) ||
        (url.endsWith('/v1/me') && !init?.headers?.['authorization'] ? r.status === 401 : false);
    if (!pass) console.error(`FAIL ${label}: ${r.status}`);
    return pass;
  } catch (err) {
    console.error(`FAIL ${label}: ${(err as Error).message}`);
    return false;
  }
}

function cliCheck(
  label: string,
  cliPath: string,
  args: string[],
  expect: string | RegExp,
): boolean {
  const r = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
  const pass = typeof expect === 'string' ? r.stdout.trim() === expect : expect.test(r.stdout);
  if (!pass) console.error(`FAIL ${label}: got "${r.stdout.trim()}"`);
  return pass;
}

async function main() {
  const { apiUrl, cliPath } = parseFlags();
  const fail: string[] = [];

  // API checks
  if (!(await apiCheck('/health 200', `${apiUrl}/health`))) fail.push('/health');
  if (!(await apiCheck('/v1/me 401 (no auth)', `${apiUrl}/v1/me`))) fail.push('/v1/me 401');
  const key = 'test-key';
  if (
    !(await apiCheck('/v1/me 200 (with key)', `${apiUrl}/v1/me`, {
      headers: { authorization: `Bearer ${key}` },
    }))
  )
    fail.push('/v1/me 200');

  // CLI checks
  if (!cliCheck('bm version', cliPath, ['version'], '0.1.0')) fail.push('bm version');
  if (!cliCheck('bm status --help', cliPath, ['status', '--help'], /show API health/i))
    fail.push('bm status --help');
  if (
    !cliCheck('bm config set --help', cliPath, ['config', 'set', '--help'], /set a config value/i)
  )
    fail.push('bm config set --help');

  const count = fail.length;
  console.log(`\nsmoke-test: ${count} failure(s)`);
  if (count > 0) console.error(fail.map((f) => `  - ${f}`).join('\n'));
  process.exit(count);
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
