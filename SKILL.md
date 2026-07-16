# Bright Memo v2 — SKILL.md

## Visão Geral

Memória compartilhada entre humanos e agentes IA.
Monorepo TS strict com API REST, CLI, Web.

## Arquitetura

```
bright-memo/
  apps/
    api/     # Fastify + Drizzle + Postgres 16 + pgvector (porta 3001)
    cli/     # Bun + commander (9 commands)
    web/     # pendente — Next.js
  packages/
    shared/  # tipos + Zod schemas + constants
  docker/   # docker-compose + postgres config
  scripts/  # db-bootstrap.ts, db-reset.ts
  docs/     # dev-quickstart.md, specs/
```

### Tech Stack

| Layer       | Tech                      |
| ----------- | ------------------------- |
| Runtime     | Node 22+ (pnpm 11 beta)   |
| Framework   | Fastify + Pino + CORS     |
| ORM         | Drizzle ORM + postgres-js |
| DB          | Postgres 16 + pgvector    |
| Package Mgr | pnpm workspaces + Turbo 2 |
| Auth        | argon2id API key (Bearer) |
| Quality     | ESLint + Prettier + Husky |
| Language    | TypeScript strict         |

## Setup Local

```bash
pnpm install
docker compose -f docker/docker-compose.yml up -d
pnpm db:migrate
pnpm db:bootstrap          # cria dev user + key em apps/api/.dev-key
pnpm --filter @bright-memo/api dev
```

API em http://localhost:3001

### Env (apps/api/.env)

```bash
PORT=3001
DATABASE_URL=postgres://bright:changeme@localhost:5432/bright_memo
NODE_ENV=development
LOG_LEVEL=info
APP_URL=http://localhost:3001
BOOTSTRAP_TOKEN_SECRET=<openssl rand -hex 32>
OPENAI_API_KEY=sk-...       # pendente (embeddings)
```

## Endpoints API

| Method | Path                     | Auth   | Desc                         |
| ------ | ------------------------ | ------ | ---------------------------- |
| GET    | /health                  | public | Health check + DB probe      |
| GET    | /v1/me                   | Bearer | User + counts (projects/mem) |
| POST   | /v1/auth/keys            | mixed  | Bootstrap or authed key mint |
| GET    | /v1/projects             | Bearer | List projects                |
| POST   | /v1/projects             | Bearer | Create project               |
| GET    | /v1/projects/:id         | Bearer | Get project                  |
| PATCH  | /v1/projects/:id         | Bearer | Update project               |
| DELETE | /v1/projects/:id         | Bearer | Delete project               |
| GET    | /v1/projects/:id/context | Bearer | Project + memories context   |
| GET    | /v1/memories             | Bearer | List memories (?projectId)   |
| POST   | /v1/memories             | Bearer | Create memory (+ embedding)  |
| GET    | /v1/memories/:id         | Bearer | Get memory                   |
| PATCH  | /v1/memories/:id         | Bearer | Update memory                |
| DELETE | /v1/memories/:id         | Bearer | Delete memory                |
| GET    | /v1/memories/search      | Bearer | HNSW vector search (?q)      |
| GET    | /v1/memories/context     | Bearer | Project + memories context   |

### Auth / Keys

2 modos POST /v1/auth/keys:

1. **Bootstrap** - header `X-Bootstrap-Token: $BOOTSTRAP_TOKEN_SECRET`, upsert user by email, retorna `{key: "bm_xxx", prefix, apiKeyId, user, created}`
2. **Authed** - Bearer key existente, minta key extra p/ mesmo user

Key hasheada com argon2id antes de salvar. Server nunca ve plaintext denovo.

### Respostas de Erro

```typescript
{ error: { code: string, message: string, details?: object }, requestId: string }
```

Códigos: VALIDATION_ERROR (422), UNAUTHORIZED (401), FORBIDDEN (403), NOT_FOUND (404), CONFLICT (409), SERVER_ERROR (500)

## Schemas DB (Drizzle)

`apps/api/src/db/schema/`

- users: id (uuid), email (unique), name?, timestamps
- api_keys: id, userId (FK), prefix (unique), hash, scopes[], name?, timestamps
- projects: id, userId (FK), name, description?, cwdAlias (unique per user), remoteUrl?, metadata (jsonb), timestamps
- memories: id, userId (FK), projectId (FK), content, source, tags[], metadata (jsonb), embedding (vector(1536)), timestamps

### RLS

FORCE RLS ativado. Toda query usa `SET LOCAL app.current_user_id` via plugin db-context.
Queries sem o context retornam 0 rows.
Service role bypassa RLS (usado so em auth/keys p/ buscar usuario).

### Embeddings

- Provider: OpenAI (text-embedding-ada-002, 1536 dims)
- Server-side only (chave em 1 lugar)
- Gerado automaticamente no POST /v1/memories
- Fallback: array de 1536 zeros se OpenAI falhar
- Search: HNSW index `<=>` cosine distance, LIMIT 20

## Shared Package (@bright-memo/shared)

Exports:

- Zod schemas: apiKey, user, project, memory (tipos + request/response)
- Constants: API_PATHS, API_ENDPOINTS, ERROR_CODES, API_KEY_SCOPES
- Types: ApiKey, User, Project, Memory, MemorySource, ApiKeyScope, ErrorCode, ApiPath, CreateKeyRequest, MeResponse, ErrorResponse, etc.

## Comandos Uteis

```bash
pnpm install              # instalar
pnpm build                # build tudo (turbo)
pnpm lint                 # lint tudo
pnpm test                 # testes (turbo)
pnpm format               # prettier

pnpm db:up                # docker compose up postgres
pnpm db:down              # docker compose down
pnpm db:migrate           # drizzle-kit migrate
pnpm db:reset             # drop + recreate + migrate
pnpm db:bootstrap         # cria dev user + key
pnpm db:psql              # psql dentro do container

pnpm --filter @bright-memo/api dev    # dev mode (tsx watch)
pnpm --filter @bright-memo/api build  # producao
pnpm --filter @bright-memo/api start  # rodar build
```

## Estado Atual (feat/v2-rebuild)

### Feito

- Monorepo (pnpm + Turbo + TS strict + Husky + commitlint)
- `@bright-memo/shared`: tipos, Zod schemas, constants
- Docker Compose Postgres 16 + pgvector
- Drizzle config + migrations (tabelas, indexes HNSW/GIN/btree, RLS)
- Scripts DB (bootstrap + reset)
- API init (Fastify + Pino + CORS + error handler)
- Plugin auth (argon2id api key)
- Plugin db-context (SET LOCAL RLS)
- Endpoints: /health, /v1/me, /v1/auth/keys, /v1/memories (CRUD + search + context), /v1/projects (CRUD + context)
- OpenAI embeddings service
- `@bright-memo/cli`: Bun + commander (9 commands: version, config, init, save, list, search, status, sync, install)
- Install flow: `scripts/install.ts`, `scripts/install-reset.ts`, `apps/cli/src/commands/install.ts` (wrapper)

### Nao verificado fim-a-fim

T-013 a T-018 commitados mas curl nao testado. Rodar dev-quickstart antes de continuar.

### Pendente

- Testes (smoke + E2E)
- Web (Next.js: signup/login/dashboard)

## Regras Importantes

1. Auth: **so API key** (Bearer). OAuth cortado. Bootstrap token p/ primeiro user.
2. RLS: ativo em todas queries normais. Usar serviceDb so onde necessario (auth/keys).
3. Embeddings: OpenAI server-side, 1 chave, gerado automaticamente, fallback 1536 zeros.
4. MCP: cortado do escopo.
5. Branch atual: feat/v2-rebuild. Remote: github.com/lchenrique/bright-memo.
