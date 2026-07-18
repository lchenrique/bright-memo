#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';

const DEFAULTS = {
  'api-url': 'http://localhost:3001',
  'cli-path': resolve(import.meta.dirname, '..', 'apps', 'cli', 'dist', 'index.js'),
  'api-key': process.env.BRIGHT_MEMO_API_KEY,
};

function parseFlags() {
  const { values } = parseArgs({
    options: {
      'api-url': { type: 'string', default: DEFAULTS['api-url'] },
      'cli-path': { type: 'string', default: DEFAULTS['cli-path'] },
      'api-key': { type: 'string', default: DEFAULTS['api-key'] },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    console.log(`Usage: smoke-test [options]

Options:
  --api-url <url>     API base URL (default: ${DEFAULTS['api-url']})
  --cli-path <path>   CLI binary path (default: ${DEFAULTS['cli-path']})
  --api-key <key>     Optional key for authenticated /v1/me check
  --help              Show this help`);
    process.exit(0);
  }
  return { apiUrl: values['api-url'], cliPath: values['cli-path'], apiKey: values['api-key'] };
}

async function apiCheck(
  label: string,
  url: string,
  expectedStatus: number,
  init?: RequestInit,
): Promise<boolean> {
  try {
    const r = await fetch(url, init);
    const pass = r.status === expectedStatus;
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
  const { apiUrl, cliPath, apiKey } = parseFlags();
  const fail: string[] = [];

  // API checks
  if (!(await apiCheck('/health 200', `${apiUrl}/health`, 200))) fail.push('/health');
  if (!(await apiCheck('/v1/me 401 (no auth)', `${apiUrl}/v1/me`, 401))) fail.push('/v1/me 401');
  if (
    apiKey &&
    !(await apiCheck('/v1/me 200 (with key)', `${apiUrl}/v1/me`, 200, {
      headers: { authorization: `Bearer ${apiKey}` },
    }))
  ) {
    fail.push('/v1/me 200');
  }

  // CLI checks
  if (!cliCheck('bm version', cliPath, ['version'], '0.2.0')) fail.push('bm version');
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
