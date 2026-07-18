# Bright Memo v0.2.1 Dev Quickstart

## Requirements

- Node `22.23.1` from `.nvmrc`
- pnpm `11.14.0` from root `packageManager`
- Docker
- Ports `5432` and `3001` available when running local DB/API

## Install

```bash
corepack enable
pnpm install --frozen-lockfile
cp docker/.env.example docker/.env
cp apps/api/.env.example apps/api/.env
```

Replace every password and secret placeholder. Three database URLs must point to the same database with admin, `bright_app` and `bright_service` roles.

`OPENAI_API_KEY` is optional. Without it, saves use `embedding = NULL` and search remains functional through PostgreSQL lexical retrieval.

## Database

```bash
docker compose -f docker/docker-compose.yml up -d --wait
pnpm db:deploy
pnpm db:deploy
pnpm db:bootstrap
```

Second deploy proves idempotency. Deploy creates `vector` and `pg_trgm`, provisions roles, applies four migrations and validates RLS, indexes and journal.

## Build and quality

```bash
pnpm lint:all
pnpm test:all
pnpm build:all
pnpm exec tsx scripts/smoke-test.ts
pnpm exec tsx scripts/e2e-gate.ts
```

E2E explicitly removes `OPENAI_API_KEY` and verifies save/update with null embeddings, lexical ranking, filters, user isolation and no vector leakage.

## API checks

```bash
curl http://localhost:3001/health
curl -i http://localhost:3001/v1/me
```

Expected: `/health` returns `200`, `status: "ok"`, `db: "up"`, version `0.2.1`; unauthenticated `/v1/me` returns `401`.

Search request:

```text
GET /v1/memories/search?q=<query>&projectId=<uuid>&limit=20&tags=tag-a,tag-b
Authorization: Bearer bm_...
```

Response includes `mode`, applied `filters`, ranked `results`, `score` and match metadata. It does not include embeddings.

## CLI

```bash
pnpm --filter @bright-memo/cli build
node apps/cli/dist/index.js version
node apps/cli/dist/index.js init --api-url http://localhost:3001 \
  --email dev@example.com --bootstrap-token <token> \
  --project-name bright-memo --project-alias bright-memo --json
node apps/cli/dist/index.js status --json
node apps/cli/dist/index.js save "lexical fallback works" --project bright-memo --tags search --json
node apps/cli/dist/index.js search "fallback" --project bright-memo --json
node apps/cli/dist/index.js list --project bright-memo --json
```

Environment overrides:

```dotenv
BRIGHT_MEMO_API_URL=http://localhost:3001
BRIGHT_MEMO_API_KEY=bm_xxx
```

Install operational skill:

```bash
node apps/cli/dist/index.js skill install --client auto --json
```

Use explicit `--client opencode`, `codex` or `claude` if auto-detection finds no client.

## Notes

- Auth uses Bright API keys, not provider keys.
- OAuth and MCP are outside current CLI/API flow.
- Memory is recall, not proof; verify repository and runtime state.
- Production deployment uses `docs/coolify-deploy.md` and never runs `db:bootstrap`.
