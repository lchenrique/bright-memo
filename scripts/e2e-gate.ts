/**
 * E2E gate for T-013 → T-018.
 *
 * Boots the compiled API on a free port inside the test, runs the
 * verification sequence required by docs/dev-quickstart.md, then
 * shuts everything down and exits non-zero on the first failed
 * assertion.
 *
 * Assertions (order matters — each is its own step):
 *   1. GET /health                → 200 + status:ok + db:up
 *   2. GET /v1/me (no auth)       → 401 UNAUTHORIZED
 *   3. POST /v1/auth/keys
 *      + X-Bootstrap-Token        → 201 + returns a fresh API key (user A)
 *   4. GET /v1/me (key A)         → 200 + user.email matches what we sent
 *   5. Direct insert (service role) of project+memory for user A and B
 *   6. Direct app-role RLS proof  → SET LOCAL user A sees only A; user B sees only B
 *   7. GET /v1/me (key A)         → projects_count=1, memories_count=1
 *   8. POST /v1/auth/keys         → new key for user B
 *   9. GET /v1/me (key B)         → projects_count=1, memories_count=1
 *
 * The harness owns its own lifecycle: it cleans up the test users,
 * kills the API child, and removes the tmp scratch dir on exit
 * (success or failure). No persistent server is left running.
 *
 * Usage: pnpm tsx scripts/e2e-gate.ts
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');
const API_DIST = join(REPO_ROOT, 'apps', 'api', 'dist', 'server.js');

loadEnv({ path: join(REPO_ROOT, 'apps', 'api', '.env') });
loadEnv({ path: join(REPO_ROOT, 'docker', '.env') });
loadEnv({ path: join(REPO_ROOT, '.env') });

const BOOTSTRAP_TOKEN_SECRET = process.env.BOOTSTRAP_TOKEN_SECRET;
if (!BOOTSTRAP_TOKEN_SECRET) {
  console.error('[gate] BOOTSTRAP_TOKEN_SECRET missing — set it in apps/api/.env');
  process.exit(2);
}

const SERVICE_DATABASE_URL =
  process.env.SERVICE_DATABASE_URL ??
  'postgres://bright_service:changeme@localhost:5432/bright_memo';
const APP_DATABASE_URL =
  process.env.APP_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://bright_app:changeme@localhost:5432/bright_memo';
const ADMIN_DATABASE_URL =
  process.env.ADMIN_DATABASE_URL ?? 'postgres://bright:changeme@localhost:5432/bright_memo';

interface Assertion {
  name: string;
  pass: boolean;
  detail: string;
}

async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('failed to bind free port'));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/health`);
      if (r.status === 200) return;
      lastErr = new Error(`health responded ${r.status}`);
    } catch (err) {
      lastErr = err;
    }
    await delay(150);
  }
  throw new Error(`api never became healthy: ${String(lastErr)}`);
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`invalid JSON (status ${res.status}): ${text.slice(0, 240)}`);
  }
}

function assert(cond: unknown, detail: string): Assertion {
  return { name: detail, pass: Boolean(cond), detail: cond ? '' : detail };
}

async function bootstrapKey(
  baseUrl: string,
  email: string,
  name: string,
): Promise<{ status: number; key: string; userId: string; prefix: string; body: unknown }> {
  const r = await fetch(`${baseUrl}/v1/auth/keys`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-bootstrap-token': BOOTSTRAP_TOKEN_SECRET ?? '',
    },
    body: JSON.stringify({ email, name }),
  });
  const body = await readJson<Record<string, unknown>>(r);
  return {
    status: r.status,
    key: typeof body.key === 'string' ? body.key : '',
    userId:
      typeof body.user === 'object' && body.user && 'id' in body.user
        ? String((body.user as { id: unknown }).id)
        : '',
    prefix: typeof body.prefix === 'string' ? body.prefix : '',
    body,
  };
}

async function cleanupServiceRows(sql: postgres.Sql, emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  await sql.unsafe(
    `DELETE FROM memories  WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
    [emails],
  );
  await sql.unsafe(
    `DELETE FROM projects  WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
    [emails],
  );
  await sql.unsafe(
    `DELETE FROM api_keys  WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`,
    [emails],
  );
  await sql.unsafe(`DELETE FROM users WHERE email = ANY($1)`, [emails]);
}

async function ensureDatabaseRoles(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bright_service') THEN
        CREATE ROLE bright_service BYPASSRLS LOGIN PASSWORD 'changeme';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bright_app') THEN
        CREATE ROLE bright_app LOGIN PASSWORD 'changeme';
      END IF;
      ALTER ROLE bright_app NOBYPASSRLS;
    END
    $$;
    GRANT USAGE ON SCHEMA public TO bright_service, bright_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON users, api_keys, projects, memories TO bright_service;
    GRANT SELECT, INSERT, UPDATE, DELETE ON users, api_keys, projects, memories TO bright_app;
  `);
}

async function selectVisibleOwnerIds(
  app: postgres.Sql,
  userId: string,
  table: 'projects' | 'memories',
  markerColumn: 'cwd_alias' | 'content',
  markers: string[],
): Promise<string[]> {
  return app.begin(async (tx) => {
    await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;
    const rows = await tx.unsafe<{ user_id: string }[]>(
      `SELECT user_id FROM ${table} WHERE ${markerColumn} = ANY($1) ORDER BY user_id`,
      [markers],
    );
    return rows.map((row) => row.user_id);
  });
}

async function main(): Promise<void> {
  const port = await pickFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const apiEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
  };

  const admin = postgres(ADMIN_DATABASE_URL, { max: 1, prepare: false });
  try {
    await ensureDatabaseRoles(admin);
  } finally {
    await admin.end({ timeout: 5 });
  }

  console.log(`[gate] booting api on ${baseUrl}`);
  const api: ChildProcess = spawn('node', [API_DIST], {
    env: apiEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let apiLog = '';
  api.stdout?.on('data', (chunk: Buffer) => {
    const s = chunk.toString();
    apiLog += s;
    process.stdout.write(`[api] ${s}`);
  });
  api.stderr?.on('data', (chunk: Buffer) => {
    const s = chunk.toString();
    apiLog += s;
    process.stderr.write(`[api!] ${s}`);
  });
  api.on('exit', (code, signal) => {
    apiLog += `\n[api exited code=${code} signal=${signal}]`;
  });

  const service = postgres(SERVICE_DATABASE_URL, { max: 1, prepare: false });
  const appRole = postgres(APP_DATABASE_URL, { max: 1, prepare: false });
  const stamp = Date.now();
  const emailA = `e2e-a-${stamp}@example.test`;
  const emailB = `e2e-b-${stamp}@example.test`;
  const results: Assertion[] = [];

  let userAId = '';
  const cleanupEmails = [emailA, emailB];

  try {
    await waitForHealth(baseUrl, 20_000);

    // 1. /health → 200, db up
    {
      const r = await fetch(`${baseUrl}/health`);
      const body = await readJson<Record<string, unknown>>(r);
      results.push(assert(r.status === 200, 'GET /health status 200'));
      results.push(assert(body.status === 'ok', 'GET /health body.status === "ok"'));
      results.push(assert(body.db === 'up', 'GET /health body.db === "up"'));
    }

    // 2. /v1/me without auth → 401
    {
      const r = await fetch(`${baseUrl}/v1/me`);
      const body = await readJson<Record<string, unknown>>(r);
      results.push(assert(r.status === 401, 'GET /v1/me (no auth) status 401'));
      results.push(
        assert(
          typeof body.error === 'object' &&
            body.error !== null &&
            (body.error as { code?: unknown }).code === 'UNAUTHORIZED',
          'GET /v1/me (no auth) error.code === "UNAUTHORIZED"',
        ),
      );
    }

    // 3. bootstrap new user A via X-Bootstrap-Token
    {
      const res = await bootstrapKey(baseUrl, emailA, 'E2E User A');
      results.push(assert(res.status === 201, 'POST /v1/auth/keys (bootstrap) status 201'));
      results.push(assert(res.key.startsWith('bm_'), 'bootstrap response.key starts with "bm_"'));
      results.push(assert(res.userId.length > 0, 'bootstrap response.user.id present'));
      results.push(assert(res.prefix.length === 12, 'bootstrap response.prefix length === 12'));
      userAId = res.userId;

      // 3a. /v1/me with that key
      const me = await fetch(`${baseUrl}/v1/me`, {
        headers: { authorization: `Bearer ${res.key}` },
      });
      const meBody = await readJson<Record<string, unknown>>(me);
      const userObj =
        typeof meBody.user === 'object' && meBody.user !== null
          ? (meBody.user as { id?: unknown; email?: unknown })
          : null;
      results.push(assert(me.status === 200, 'GET /v1/me (key A) status 200'));
      results.push(
        assert(userObj?.email === emailA, `GET /v1/me (key A) user.email === ${emailA}`),
      );
      results.push(
        assert(userObj?.id === userAId, 'GET /v1/me (key A) user.id matches bootstrap user'),
      );
      results.push(assert(meBody.projects_count === 0, 'GET /v1/me (key A) projects_count === 0'));
      results.push(assert(meBody.memories_count === 0, 'GET /v1/me (key A) memories_count === 0'));

      // 4. Insert user A fixture rows directly via service role (BYPASSRLS)
      const projectAliasA = `e2e-a-${stamp}`;
      const projectAliasB = `e2e-b-${stamp}`;
      const memoryContentA = `memory-a-${stamp}`;
      const memoryContentB = `memory-b-${stamp}`;
      const projRows = await service<{ id: string }[]>`
        INSERT INTO projects (user_id, name, cwd_alias, description)
        VALUES (${userAId}, ${'e2e-a-proj'}, ${projectAliasA}, ${'RLS isolation fixture A'})
        RETURNING id
      `;
      const projectId = projRows[0]?.id;
      if (!projectId) throw new Error('failed to insert test project');

      const embedding = Array.from({ length: 1536 }, (_, i) => i * 1e-4);
      const embeddingLiteral = `[${embedding.join(',')}]`;
      await service.unsafe(
        `INSERT INTO memories (project_id, user_id, content, embedding, source, tags)
         VALUES ($1, $2, $3, $4::vector, 'cli-save', ARRAY['e2e','gate']::text[])`,
        [projectId, userAId, memoryContentA, embeddingLiteral],
      );

      // 6. Bootstrap a fresh key for user B
      const resB = await bootstrapKey(baseUrl, emailB, 'E2E User B');
      results.push(assert(resB.status === 201, 'POST /v1/auth/keys (bootstrap B) status 201'));
      results.push(assert(resB.userId !== userAId, 'user B has a distinct id from user A'));

      // 7. Insert user B fixture rows, then prove RLS with app role directly.
      const projRowsB = await service<{ id: string }[]>`
        INSERT INTO projects (user_id, name, cwd_alias, description)
        VALUES (${resB.userId}, ${'e2e-b-proj'}, ${projectAliasB}, ${'RLS isolation fixture B'})
        RETURNING id
      `;
      const projectBId = projRowsB[0]?.id;
      if (!projectBId) throw new Error('failed to insert user B test project');
      await service.unsafe(
        `INSERT INTO memories (project_id, user_id, content, embedding, source, tags)
         VALUES ($1, $2, $3, $4::vector, 'cli-save', ARRAY['e2e','gate']::text[])`,
        [projectBId, resB.userId, memoryContentB, embeddingLiteral],
      );

      const projectMarkers = [projectAliasA, projectAliasB];
      const memoryMarkers = [memoryContentA, memoryContentB];
      const projectsSeenByA = await selectVisibleOwnerIds(
        appRole,
        userAId,
        'projects',
        'cwd_alias',
        projectMarkers,
      );
      const projectsSeenByB = await selectVisibleOwnerIds(
        appRole,
        resB.userId,
        'projects',
        'cwd_alias',
        projectMarkers,
      );
      const memoriesSeenByA = await selectVisibleOwnerIds(
        appRole,
        userAId,
        'memories',
        'content',
        memoryMarkers,
      );
      const memoriesSeenByB = await selectVisibleOwnerIds(
        appRole,
        resB.userId,
        'memories',
        'content',
        memoryMarkers,
      );
      results.push(
        assert(
          projectsSeenByA.length === 1 && projectsSeenByA[0] === userAId,
          'direct app-role RLS: user A sees only project A',
        ),
      );
      results.push(
        assert(
          projectsSeenByB.length === 1 && projectsSeenByB[0] === resB.userId,
          'direct app-role RLS: user B sees only project B',
        ),
      );
      results.push(
        assert(
          memoriesSeenByA.length === 1 && memoriesSeenByA[0] === userAId,
          'direct app-role RLS: user A sees only memory A',
        ),
      );
      results.push(
        assert(
          memoriesSeenByB.length === 1 && memoriesSeenByB[0] === resB.userId,
          'direct app-role RLS: user B sees only memory B',
        ),
      );

      // 8. /v1/me (key A) → counts reflect only A rows through req.db RLS.
      const me2 = await fetch(`${baseUrl}/v1/me`, {
        headers: { authorization: `Bearer ${res.key}` },
      });
      const me2Body = await readJson<Record<string, unknown>>(me2);
      results.push(assert(me2.status === 200, 'GET /v1/me (key A) post-insert status 200'));
      results.push(assert(me2Body.projects_count === 1, 'GET /v1/me (key A) projects_count === 1'));
      results.push(assert(me2Body.memories_count === 1, 'GET /v1/me (key A) memories_count === 1'));

      // 9. /v1/me (key B) → counts reflect only B rows through req.db RLS.
      const meB = await fetch(`${baseUrl}/v1/me`, {
        headers: { authorization: `Bearer ${resB.key}` },
      });
      const meBBody = await readJson<Record<string, unknown>>(meB);
      results.push(assert(meB.status === 200, 'GET /v1/me (key B) status 200'));
      results.push(
        assert(
          typeof meBBody.user === 'object' &&
            meBBody.user !== null &&
            (meBBody.user as { email?: unknown }).email === emailB,
          `GET /v1/me (key B) user.email === ${emailB}`,
        ),
      );
      results.push(assert(meBBody.projects_count === 1, 'GET /v1/me (key B) projects_count === 1'));
      results.push(assert(meBBody.memories_count === 1, 'GET /v1/me (key B) memories_count === 1'));

      // 10. T-019 /v1/projects CRUD + RLS cross-check
      const t019Alias = `e2e-t019-${stamp}`;
      const t019Name = 'T-019 Test Project';

      // POST create
      const createRes = await fetch(`${baseUrl}/v1/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${res.key}` },
        body: JSON.stringify({ name: t019Name, cwdAlias: t019Alias }),
      });
      results.push(assert(createRes.status === 201, 'POST /v1/projects status 201'));
      const createBody = await readJson<Record<string, unknown>>(createRes);
      const t019ProjectId = createBody.id;
      results.push(
        assert(
          typeof t019ProjectId === 'string' && t019ProjectId.length > 0,
          'POST /v1/projects response.id present',
        ),
      );
      results.push(assert(createBody.name === t019Name, 'POST /v1/projects response.name matches'));
      results.push(
        assert(createBody.cwdAlias === t019Alias, 'POST /v1/projects response.cwdAlias matches'),
      );
      results.push(
        assert(createBody.userId === userAId, 'POST /v1/projects response.userId matches'),
      );

      // GET /v1/projects list
      const listRes = await fetch(`${baseUrl}/v1/projects`, {
        headers: { authorization: `Bearer ${res.key}` },
      });
      results.push(assert(listRes.status === 200, 'GET /v1/projects status 200'));
      const listBody = await readJson<unknown[]>(listRes);
      results.push(assert(Array.isArray(listBody), 'GET /v1/projects returns array'));
      results.push(assert(listBody.length >= 1, 'GET /v1/projects array non-empty'));

      // GET /v1/projects/:id detail
      const getRes = await fetch(`${baseUrl}/v1/projects/${t019ProjectId}`, {
        headers: { authorization: `Bearer ${res.key}` },
      });
      results.push(assert(getRes.status === 200, 'GET /v1/projects/:id status 200'));
      const getBody = await readJson<Record<string, unknown>>(getRes);
      results.push(
        assert(getBody.id === t019ProjectId, 'GET /v1/projects/:id response.id matches'),
      );
      results.push(
        assert(getBody.cwdAlias === t019Alias, 'GET /v1/projects/:id response.cwdAlias matches'),
      );

      // GET /v1/projects/:id/context shape check
      const ctxRes = await fetch(`${baseUrl}/v1/projects/${t019ProjectId}/context`, {
        headers: { authorization: `Bearer ${res.key}` },
      });
      results.push(assert(ctxRes.status === 200, 'GET /v1/projects/:id/context status 200'));
      const ctxBody = await readJson<Record<string, unknown>>(ctxRes);
      results.push(
        assert(
          typeof ctxBody.project === 'object' &&
            ctxBody.project !== null &&
            Array.isArray(ctxBody.memories),
          'GET /v1/projects/:id/context shape {project, memories[]}',
        ),
      );

      // PATCH /v1/projects/:id update cwdAlias
      const newAlias = `${t019Alias}-patched`;
      const patchRes = await fetch(`${baseUrl}/v1/projects/${t019ProjectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${res.key}` },
        body: JSON.stringify({ cwdAlias: newAlias }),
      });
      results.push(assert(patchRes.status === 200, 'PATCH /v1/projects/:id status 200'));
      const patchBody = await readJson<Record<string, unknown>>(patchRes);
      results.push(
        assert(patchBody.cwdAlias === newAlias, 'PATCH /v1/projects/:id cwdAlias reflected'),
      );
      results.push(assert(patchBody.name === t019Name, 'PATCH /v1/projects/:id name unchanged'));

      // Duplicate cwdAlias → 409
      const dupRes = await fetch(`${baseUrl}/v1/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${res.key}` },
        body: JSON.stringify({ name: 'Duplicate', cwdAlias: newAlias }),
      });
      results.push(
        assert(dupRes.status === 409, 'POST /v1/projects duplicate cwdAlias status 409'),
      );
      const dupBody = await readJson<Record<string, unknown>>(dupRes);
      results.push(
        assert(
          typeof dupBody.error === 'object' &&
            dupBody.error !== null &&
            (dupBody.error as { code?: unknown }).code === 'CONFLICT',
          'POST /v1/projects duplicate cwdAlias error.code === "CONFLICT"',
        ),
      );

      // User B tries to GET user A's project → 404 (RLS isolation)
      const crossRes = await fetch(`${baseUrl}/v1/projects/${t019ProjectId}`, {
        headers: { authorization: `Bearer ${resB.key}` },
      });
      results.push(
        assert(crossRes.status === 404, 'GET /v1/projects/:id user B → 404 on A project'),
      );

      // DELETE /v1/projects/:id
      const delRes = await fetch(`${baseUrl}/v1/projects/${t019ProjectId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${res.key}` },
      });
      results.push(assert(delRes.status === 204, 'DELETE /v1/projects/:id status 204'));

      // GET after delete → 404
      const getDelRes = await fetch(`${baseUrl}/v1/projects/${t019ProjectId}`, {
        headers: { authorization: `Bearer ${res.key}` },
      });
      results.push(assert(getDelRes.status === 404, 'GET /v1/projects/:id after delete → 404'));

      // /v1/me projects_count still 1 (create+delete net zero on seed)
      const me3 = await fetch(`${baseUrl}/v1/me`, {
        headers: { authorization: `Bearer ${res.key}` },
      });
      const me3Body = await readJson<Record<string, unknown>>(me3);
      results.push(assert(me3.status === 200, 'GET /v1/me (key A) after CRUD status 200'));
      results.push(
        assert(me3Body.projects_count === 1, 'GET /v1/me (key A) projects_count net 1 after CRUD'),
      );

      // 11. T-020 /v1/memories CRUD + RLS cross-check
      const t020ProjAlias = `e2e-t020-proj-${stamp}`;
      const t020Content = `e2e-t020-${stamp}`;

      // Create a project (memories require projectId FK)
      const mpRes = await fetch(`${baseUrl}/v1/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${res.key}` },
        body: JSON.stringify({ name: 'T-020 Project', cwdAlias: t020ProjAlias }),
      });
      results.push(assert(mpRes.status === 201, 'POST /v1/projects (T-020 seed) status 201'));
      const mpBody = await readJson<Record<string, unknown>>(mpRes);
      const t020ProjectId = mpBody.id;

      const t020Embedding = Array.from({ length: 1536 }, (_, i) => i * 1e-4);

      // POST /v1/memories — create
      const cmRes = await fetch(`${baseUrl}/v1/memories`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${res.key}` },
        body: JSON.stringify({
          projectId: t020ProjectId,
          content: t020Content,
          source: 'agent',
          tags: ['e2e', 'gate'],
          embedding: t020Embedding,
        }),
      });
      results.push(assert(cmRes.status === 201, 'POST /v1/memories status 201'));
      const cmBody = await readJson<Record<string, unknown>>(cmRes);
      const t020MemoryId = cmBody.id;
      results.push(
        assert(
          typeof t020MemoryId === 'string' && t020MemoryId.length > 0,
          'POST /v1/memories response.id present',
        ),
      );
      results.push(
        assert(cmBody.content === t020Content, 'POST /v1/memories response.content matches'),
      );
      results.push(
        assert(cmBody.projectId === t020ProjectId, 'POST /v1/memories response.projectId matches'),
      );
      results.push(
        assert(cmBody.source === 'agent', 'POST /v1/memories response.source === "agent"'),
      );

      // GET /v1/memories — list all
      const lmRes = await fetch(`${baseUrl}/v1/memories`, {
        headers: { authorization: `Bearer ${res.key}` },
      });
      results.push(assert(lmRes.status === 200, 'GET /v1/memories status 200'));
      const lmBody = await readJson<unknown[]>(lmRes);
      results.push(assert(Array.isArray(lmBody), 'GET /v1/memories returns array'));
      results.push(assert(lmBody.length >= 1, 'GET /v1/memories non-empty'));

      // GET /v1/memories?projectId= — filter
      const fmRes = await fetch(`${baseUrl}/v1/memories?projectId=${t020ProjectId}`, {
        headers: { authorization: `Bearer ${res.key}` },
      });
      results.push(assert(fmRes.status === 200, 'GET /v1/memories?projectId= status 200'));
      const fmBody = await readJson<unknown[]>(fmRes);
      results.push(assert(Array.isArray(fmBody), 'GET /v1/memories?projectId= returns array'));
      results.push(assert(fmBody.length === 1, 'GET /v1/memories?projectId= length === 1'));

      // GET /v1/memories/:id — detail
      const gmRes = await fetch(`${baseUrl}/v1/memories/${t020MemoryId}`, {
        headers: { authorization: `Bearer ${res.key}` },
      });
      results.push(assert(gmRes.status === 200, 'GET /v1/memories/:id status 200'));
      const gmBody = await readJson<Record<string, unknown>>(gmRes);
      results.push(assert(gmBody.id === t020MemoryId, 'GET /v1/memories/:id response.id matches'));
      results.push(
        assert(gmBody.content === t020Content, 'GET /v1/memories/:id response.content matches'),
      );
      results.push(
        assert(
          gmBody.projectId === t020ProjectId,
          'GET /v1/memories/:id response.projectId matches',
        ),
      );

      // PATCH /v1/memories/:id — update content
      const newContent = `${t020Content}-patched`;
      const pmRes = await fetch(`${baseUrl}/v1/memories/${t020MemoryId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${res.key}` },
        body: JSON.stringify({ content: newContent }),
      });
      results.push(assert(pmRes.status === 200, 'PATCH /v1/memories/:id status 200'));
      const pmBody = await readJson<Record<string, unknown>>(pmRes);
      results.push(assert(pmBody.content === newContent, 'PATCH /v1/memories/:id content updated'));

      // User B → GET A memory → 404 (RLS)
      const xmRes = await fetch(`${baseUrl}/v1/memories/${t020MemoryId}`, {
        headers: { authorization: `Bearer ${resB.key}` },
      });
      results.push(assert(xmRes.status === 404, 'GET /v1/memories/:id user B → 404 on A memory'));

      // User B → GET /v1/memories?projectId=A → empty
      const xfRes = await fetch(`${baseUrl}/v1/memories?projectId=${t020ProjectId}`, {
        headers: { authorization: `Bearer ${resB.key}` },
      });
      results.push(
        assert(xfRes.status === 200, 'GET /v1/memories?projectId= (user B, A project) status 200'),
      );
      const xfBody = await readJson<unknown[]>(xfRes);
      results.push(
        assert(
          Array.isArray(xfBody) && xfBody.length === 0,
          'GET /v1/memories?projectId= (user B, A project) empty',
        ),
      );

      // DELETE /v1/memories/:id
      const dmRes = await fetch(`${baseUrl}/v1/memories/${t020MemoryId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${res.key}` },
      });
      results.push(assert(dmRes.status === 204, 'DELETE /v1/memories/:id status 204'));

      // GET after delete → 404
      const gdRes = await fetch(`${baseUrl}/v1/memories/${t020MemoryId}`, {
        headers: { authorization: `Bearer ${res.key}` },
      });
      results.push(assert(gdRes.status === 404, 'GET /v1/memories/:id after delete → 404'));

      // /v1/me memories_count net 1 (seed + T-020 create - T-020 delete = 1)
      const me4 = await fetch(`${baseUrl}/v1/me`, {
        headers: { authorization: `Bearer ${res.key}` },
      });
      const me4Body = await readJson<Record<string, unknown>>(me4);
      results.push(assert(me4.status === 200, 'GET /v1/me (key A) after memory CRUD status 200'));
      results.push(
        assert(me4Body.memories_count === 1, 'GET /v1/me (key A) memories_count net 1 after CRUD'),
      );

      // 12. T-021 /v1/memories/search — endpoint structure
      {
        // 12a. No q → 400
        const sq0 = await fetch(`${baseUrl}/v1/memories/search`, {
          headers: { authorization: `Bearer ${res.key}` },
        });
        results.push(assert(sq0.status === 400, 'GET /v1/memories/search (no q) status 400'));

        // 12b. With q — probe OpenAI availability (200=ok, 502=no key)
        const sq1 = await fetch(
          `${baseUrl}/v1/memories/search?q=${encodeURIComponent('meaning of life')}`,
          { headers: { authorization: `Bearer ${res.key}` } },
        );
        const sq1Body = await readJson<Record<string, unknown>>(sq1);
        const searchOk = sq1.status === 200;
        const searchNoKey =
          sq1.status === 502 &&
          typeof sq1Body.error === 'object' &&
          sq1Body.error !== null &&
          (sq1Body.error as Record<string, unknown>).code === 'EMBEDDING_ERROR';
        results.push(
          assert(
            searchOk || searchNoKey,
            `GET /v1/memories/search?q= status ${sq1.status} (200=ok, 502=no OpenAI key)`,
          ),
        );

        if (searchOk) {
          results.push(assert(Array.isArray(sq1Body.results), 'search results is array'));
          results.push(assert(typeof sq1Body.query === 'string', 'search response has query'));

          const sResults = sq1Body.results as unknown[];
          if (sResults.length > 0) {
            const r0 = sResults[0] as Record<string, unknown>;
            results.push(
              assert(
                typeof r0.similarity === 'number' && r0.similarity >= -1 && r0.similarity <= 1,
                'search result[0].similarity in [-1,1]',
              ),
            );
          }

          // 13. T-021 content ranking — 2 memories, verify search returns them
          {
            const embA = Array.from({ length: 1536 }, () => 0.1);
            const embB = Array.from({ length: 1536 }, () => 0.9);
            const memAContent = `e2e-rank-a-${stamp}`;
            const memBContent = `e2e-rank-b-${stamp}`;

            const maRes = await fetch(`${baseUrl}/v1/memories`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${res.key}` },
              body: JSON.stringify({
                projectId: t020ProjectId,
                content: memAContent,
                source: 'agent',
                embedding: embA,
              }),
            });
            results.push(assert(maRes.status === 201, 'POST /v1/memories (rank A) status 201'));
            const maBody = await readJson<Record<string, unknown>>(maRes);
            const memAId = maBody.id;

            const mbRes = await fetch(`${baseUrl}/v1/memories`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${res.key}` },
              body: JSON.stringify({
                projectId: t020ProjectId,
                content: memBContent,
                source: 'agent',
                embedding: embB,
              }),
            });
            results.push(assert(mbRes.status === 201, 'POST /v1/memories (rank B) status 201'));
            const mbBody = await readJson<Record<string, unknown>>(mbRes);
            const memBId = mbBody.id;

            const srRes = await fetch(
              `${baseUrl}/v1/memories/search?q=${encodeURIComponent('test ranking')}`,
              { headers: { authorization: `Bearer ${res.key}` } },
            );
            results.push(
              assert(srRes.status === 200, 'GET /v1/memories/search?q= (ranking) status 200'),
            );
            const srBody = await readJson<Record<string, unknown>>(srRes);
            const srResults = srBody.results as unknown[];
            results.push(assert(Array.isArray(srResults), 'ranking search results is array'));
            results.push(assert(srResults.length >= 1, 'ranking search results non-empty'));

            if (Array.isArray(srResults)) {
              const foundA = srResults.some(
                (r: unknown) => (r as Record<string, unknown>).id === memAId,
              );
              const foundB = srResults.some(
                (r: unknown) => (r as Record<string, unknown>).id === memBId,
              );
              results.push(assert(foundA, 'ranking: memory A in search results'));
              results.push(assert(foundB, 'ranking: memory B in search results'));

              for (let i = 0; i < srResults.length && i < 2; i++) {
                const sim = (srResults[i] as Record<string, unknown>).similarity;
                results.push(
                  assert(
                    typeof sim === 'number' && sim >= -1 && sim <= 1,
                    `ranking: result[${i}].similarity ${sim} in [-1,1]`,
                  ),
                );
              }
              if (srResults.length >= 2) {
                const s0 = (srResults[0] as Record<string, unknown>).similarity as number;
                const s1 = (srResults[1] as Record<string, unknown>).similarity as number;
                results.push(assert(s0 >= s1, 'ranking: results ordered by similarity desc'));
              }
            }

            // Cleanup ranking memories
            await Promise.allSettled([
              fetch(`${baseUrl}/v1/memories/${memAId}`, {
                method: 'DELETE',
                headers: { authorization: `Bearer ${res.key}` },
              }),
              fetch(`${baseUrl}/v1/memories/${memBId}`, {
                method: 'DELETE',
                headers: { authorization: `Bearer ${res.key}` },
              }),
            ]);
          }
        } else {
          results.push(assert(true, 'T-021 ranking skipped (no OpenAI key)'));
        }
      }

      // 14. T-023 auto-embed — POST without embedding body
      {
        const aeRes = await fetch(`${baseUrl}/v1/memories`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${res.key}` },
          body: JSON.stringify({
            projectId: t020ProjectId,
            content: `e2e-autoembed-${stamp}`,
            source: 'agent',
            tags: ['e2e', 'auto-embed'],
          }),
        });

        if (aeRes.status === 201) {
          results.push(assert(true, 'POST /v1/memories (no embedding) status 201'));
          const aeBody = await readJson<Record<string, unknown>>(aeRes);
          results.push(
            assert(
              Array.isArray(aeBody.embedding) && (aeBody.embedding as unknown[]).length === 1536,
              'POST /v1/memories (no embedding) => embedding Array(1536)',
            ),
          );
          const aeId = aeBody.id;
          if (typeof aeId === 'string') {
            await fetch(`${baseUrl}/v1/memories/${aeId}`, {
              method: 'DELETE',
              headers: { authorization: `Bearer ${res.key}` },
            });
          }
        } else if (aeRes.status === 422) {
          results.push(
            assert(
              false,
              'POST /v1/memories (no embedding) 422 — embedding required by schema, auto-embed unreachable',
            ),
          );
        } else {
          results.push(
            assert(false, `POST /v1/memories (no embedding) status ${aeRes.status} unexpected`),
          );
        }
      }
    }
  } catch (err) {
    console.error('[gate] fatal:', err);
    results.push({ name: 'harness execution', pass: false, detail: String(err) });
  } finally {
    try {
      await cleanupServiceRows(service, cleanupEmails);
    } catch (err) {
      console.warn('[gate] cleanup warning:', err);
    }
    await appRole.end({ timeout: 5 });
    await service.end({ timeout: 5 });

    if (api.exitCode === null) {
      api.kill('SIGTERM');
      const exitDeadline = Date.now() + 3000;
      while (Date.now() < exitDeadline && api.exitCode === null) {
        await delay(100);
      }
      if (api.exitCode === null) api.kill('SIGKILL');
    }
  }

  // report
  const failed = results.filter((r) => !r.pass);
  console.log('\n[gate] --- results ---');
  for (const r of results) {
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}`);
  }
  console.log(`\n[gate] ${results.length - failed.length}/${results.length} assertions passed`);

  if (failed.length > 0) {
    console.error('\n[gate] FAILED assertions:');
    for (const r of failed) console.error(`  - ${r.detail || r.name}`);
    console.error('\n--- api log tail ---');
    console.error(apiLog.slice(-2000));
    process.exit(1);
  }

  process.exit(0);
}

void main().catch((err) => {
  console.error('[gate] uncaught:', err);
  process.exit(1);
});
