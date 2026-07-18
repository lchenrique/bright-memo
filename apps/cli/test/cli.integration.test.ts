import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const cliEntry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
const projectId = '2c36bc2f-5acf-47a7-9f62-2355d070e686';
const memoryId = '875435eb-6532-47d9-8610-7b245d24c43f';

interface SeenRequest {
  method: string;
  path: string;
  authorization?: string;
  bootstrapToken?: string;
  body: unknown;
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function runCli(
  args: string[],
  environment: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, cliEntry, ...args], {
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('operational commands emit one JSON value and scope memory calls to a project', async (t) => {
  const seen: SeenRequest[] = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const body = await requestBody(request);
    seen.push({
      method: request.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
      authorization: request.headers.authorization,
      bootstrapToken: request.headers['x-bootstrap-token'] as string | undefined,
      body,
    });

    if (url.pathname === '/v1/projects' && request.method === 'GET') {
      send(response, 200, [{ id: projectId, name: 'Repo', cwdAlias: 'repo' }]);
    } else if (url.pathname === '/v1/memories/search') {
      send(response, 200, {
        query: url.searchParams.get('q'),
        mode: 'lexical',
        filters: { projectId, limit: 5, tags: [] },
        results: [],
      });
    } else if (url.pathname === '/v1/memories' && request.method === 'POST') {
      send(response, 201, { id: memoryId, ...(body as object) });
    } else if (url.pathname === '/v1/memories' && request.method === 'GET') {
      send(response, 200, [
        {
          id: memoryId,
          content: 'lexical fallback works',
          tags: ['search'],
          createdAt: '2026-07-18T00:00:00.000Z',
        },
      ]);
    } else if (url.pathname === '/health') {
      send(response, 200, { status: 'ok', db: 'up', version: '0.2.1', uptime: 1 });
    } else if (url.pathname === '/v1/me') {
      send(response, 200, { user: { email: 'dev@example.test', name: 'Dev' } });
    } else {
      send(response, 404, { error: { code: 'NOT_FOUND', message: 'not found' } });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const environment = {
    BRIGHT_MEMO_API_URL: `http://127.0.0.1:${address.port}`,
    BRIGHT_MEMO_API_KEY: 'bm_test_key',
  };

  for (const args of [
    ['search', 'fallback', '--project', 'repo', '--limit', '5', '--json'],
    ['save', 'lexical fallback works', '--project', 'repo', '--tags', 'search', '--json'],
    ['list', '--project', 'repo', '--limit', '1', '--json'],
    ['status', '--json'],
  ]) {
    const result = await runCli(args, environment);
    assert.equal(result.code, 0, `${args[0]} stderr: ${result.stderr}`);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout.trim().split(/\r?\n/).length, 1);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
  }

  assert(
    seen.every((request) => request.authorization === 'Bearer bm_test_key'),
    'all authenticated requests use environment API key',
  );
  const search = seen.find((request) => request.path.startsWith('/v1/memories/search?'));
  assert(search);
  assert.equal(new URL(search.path, 'http://localhost').searchParams.get('projectId'), projectId);
  const save = seen.find((request) => request.path === '/v1/memories' && request.method === 'POST');
  assert.deepEqual(save?.body, {
    projectId,
    content: 'lexical fallback works',
    source: 'cli',
    tags: ['search'],
  });
  assert(seen.some((request) => request.path === `/v1/memories?projectId=${projectId}`));
});

test('init supports non-interactive JSON setup without OpenAI configuration', async (t) => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'bright-memo-cli-home-'));
  t.after(() => rm(tempHome, { recursive: true, force: true }));
  const seen: SeenRequest[] = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const body = await requestBody(request);
    seen.push({
      method: request.method ?? 'GET',
      path: url.pathname,
      authorization: request.headers.authorization,
      bootstrapToken: request.headers['x-bootstrap-token'] as string | undefined,
      body,
    });
    if (url.pathname === '/v1/auth/keys') {
      send(response, 201, {
        key: 'bm_new_key',
        prefix: 'bm_new_key12',
        apiKeyId: 'aa120406-d339-4277-ab95-109fc7afdf00',
        user: { id: '4050b298-6c04-4357-9df9-a9d4fd1a4aaf', email: 'dev@example.test', name: null },
      });
    } else if (url.pathname === '/v1/me') {
      send(response, 200, {
        user: { id: '4050b298-6c04-4357-9df9-a9d4fd1a4aaf', email: 'dev@example.test', name: null },
      });
    } else if (url.pathname === '/v1/projects') {
      send(response, 201, { id: projectId, name: 'Repo', cwdAlias: 'repo' });
    } else {
      send(response, 404, { error: { code: 'NOT_FOUND', message: 'not found' } });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const result = await runCli(
    [
      'init',
      '--api-url',
      `http://127.0.0.1:${address.port}`,
      '--email',
      'dev@example.test',
      '--bootstrap-token',
      'bootstrap-test',
      '--project-name',
      'Repo',
      '--project-alias',
      'repo',
      '--json',
    ],
    { HOME: tempHome, USERPROFILE: tempHome, OPENAI_API_KEY: '' },
  );

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1);
  const output = JSON.parse(result.stdout) as Record<string, unknown>;
  assert.equal(output.authenticated, true);
  assert.equal((output.project as { cwdAlias: string }).cwdAlias, 'repo');
  assert.equal(seen[0]?.bootstrapToken, 'bootstrap-test');
  assert.equal(seen[1]?.authorization, 'Bearer bm_new_key');
  assert.equal(seen[2]?.authorization, 'Bearer bm_new_key');
  assert.equal('OPENAI_API_KEY' in (seen[0]?.body as object), false);
});

test('JSON failures stay machine-readable and exit non-zero', async () => {
  const server = createServer((_request, response) => send(response, 200, []));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  try {
    const result = await runCli(['search', 'anything', '--project', 'missing', '--json'], {
      BRIGHT_MEMO_API_URL: `http://127.0.0.1:${address.port}`,
      BRIGHT_MEMO_API_KEY: 'bm_test_key',
    });
    assert.notEqual(result.code, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
      error: { code: 'CLI_ERROR', message: 'Project "missing" not found.' },
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('config writes never persist environment API credentials', async (t) => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'bright-memo-config-home-'));
  t.after(() => rm(tempHome, { recursive: true, force: true }));
  const result = await runCli(['config', 'set', 'defaultProject', 'repo'], {
    HOME: tempHome,
    USERPROFILE: tempHome,
    BRIGHT_MEMO_API_URL: 'https://env.example',
    BRIGHT_MEMO_API_KEY: 'bm_environment_secret',
  });

  assert.equal(result.code, 0, result.stderr);
  const stored = JSON.parse(
    await readFile(path.join(tempHome, '.bright-memo', 'config.json'), 'utf8'),
  ) as Record<string, unknown>;
  assert.deepEqual(stored, { defaultProject: 'repo' });
});
