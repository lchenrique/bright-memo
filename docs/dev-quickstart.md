# Bright Memo v2 — Dev Quickstart

Setup local de desenvolvimento, estado atual do projeto, próximos passos.

> Documento de referência rápida. Para detalhes, ver `README.md` e arquivos em `apps/*`.

## Setup Inicial

```bash
cd "D:\projetos pessoais\bright-memo"

# 1. Dependências
pnpm install

# 2. Subir Postgres + pgvector
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml ps   # verificar "healthy"

# 3. Rodar migrations
pnpm db:migrate

# 4. Criar user dev + API key (gera apps/api/.dev-key)
pnpm db:bootstrap

# 5. Subir API
pnpm --filter @bright-memo/api dev
# API em http://localhost:3001
```

## Verificação Rápida

```bash
# Health check (sem auth)
curl http://localhost:3001/health
# Esperado: {"status":"ok","db":"up",...}

# /v1/me sem auth (deve dar 401)
curl -i http://localhost:3001/v1/me

# /v1/me com a dev key
curl -H "Authorization: Bearer $(cat apps/api/.dev-key)" http://localhost:3001/v1/me
# Esperado: {"user":{"id":"...","email":"dev@brightmemo.local",...}}

# Criar key nova via bootstrap
curl -X POST \
  -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@x.com","name":"Teste"}' \
  http://localhost:3001/v1/auth/keys
# Esperado: {"key":"bm_xxx","user":{...},"prefix":"bm_abc12"}
```

## Estrutura

```
bright-memo/
├── apps/
│   ├── api/         # Fastify + Drizzle (porta 3001)
│   ├── cli/         # pendente — Bun + commander
│   └── web/         # pendente — Next.js
├── packages/
│   ├── shared/      # tipos + Zod schemas + constants
│   └── skill/       # pendente — SKILL.md
├── docker/
│   ├── docker-compose.yml
│   └── postgres.conf
├── scripts/
│   ├── db-bootstrap.ts
│   └── db-reset.ts
└── docs/
```

## Estado Atual

### ✅ Pronto (commitado em `feat/v2-rebuild`)

| Task | Descrição |
|------|-----------|
| T-001 | Monorepo (pnpm + Turbo + TS strict) |
| T-002 | Husky + lint-staged + commitlint |
| T-003 | `@bright-memo/shared` init |
| T-004 | Tipos + Zod schemas (User, ApiKey, Project, Memory) |
| T-005 | Zod schemas request/response (auth, projects, memories) |
| T-006 | Constantes (11 paths /v1/*, error codes, scopes) |
| T-007 | Docker Compose Postgres 16 + pgvector |
| T-008 | Drizzle config + postgres-js client |
| T-009 | Migration 0000 — tabelas |
| T-010 | Migration 0001 — HNSW + GIN + btree |
| T-011 | Migration 0002 — RLS + FORCE RLS + service role |
| T-012 | Scripts DB (bootstrap + reset) |
| T-013 | Init API (env config, Fastify boot) |
| T-014 | Fastify + Pino + CORS |
| T-015 | Plugin auth (argon2id api key) |
| T-016 | Plugin db-context (SET LOCAL RLS) |
| T-017 | Health + error handler |
| T-018 | Endpoints auth (`/v1/auth/keys`, `/v1/me`) |

### ⚠️ Não verificado fim-a-fim

Por causa de cancelamentos de sessão de agents, T-013 ao T-018 foram commitados mas **não passaram pela sequência de verificação** (docker up, migrate, curl).

**Antes de continuar implementando T-019+, rodar a sequência de Verificação Rápida acima e garantir:**
- API sobe sem erro
- `/health` retorna 200
- `/v1/me` autentica com a dev key
- RLS filtra corretamente

### ⏳ Pendente

| Task | Descrição |
|------|-----------|
| T-019 | Endpoints projects (CRUD parcial) |
| T-020 | Endpoints memories (CRUD) |
| T-021 | Endpoint search (HNSW) |
| T-022 | OpenAI embeddings service |
| T-023 | Hook embedding no POST memories |
| T-024 | Search query embedding |
| T-025-T-035 | CLI (binário Bun + 9 comandos) |
| T-036-T-042 | Install flow (4 fases) |
| T-043 | SKILL.md |
| T-044-T-046 | Testes (smoke + E2E + validação IDE) |
| T-047-T-051 | Web (Next.js: signup/login/dashboard) |

## Comandos Úteis

```bash
# Docker
pnpm db:up                                 # sobe Postgres
pnpm db:down                               # para Postgres
pnpm db:logs                               # logs do container
pnpm db:psql                               # psql conectado

# DB
pnpm db:migrate                            # roda migrations
pnpm db:reset                              # drop + recreate + migrate (pede confirmação)
pnpm db:bootstrap                          # cria dev user + key

# API
pnpm --filter @bright-memo/api dev         # dev mode (tsx watch)
pnpm --filter @bright-memo/api build       # build produção
pnpm --filter @bright-memo/api start       # roda build de produção

# Quality
pnpm turbo lint                            # ESLint
pnpm turbo build                           # build tudo
pnpm turbo test                            # roda testes
pnpm format                                # prettier write
```

## Variáveis de Ambiente

API (`apps/api/.env`):
```bash
PORT=3001
DATABASE_URL=postgres://bright:changeme@localhost:5432/bright_memo
NODE_ENV=development
LOG_LEVEL=info
APP_URL=http://localhost:3001
BOOTSTRAP_TOKEN_SECRET=<openssl rand -hex 32>
OPENAI_API_KEY=sk-...                      # pendente usar (embeddings)
```

Gerar BOOTSTRAP_TOKEN_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Branch e Push

```bash
# Branch atual: feat/v2-rebuild
# Remote: github.com/lchenrique/bright-memo

git status                                 # working tree state
git log --oneline -10                      # últimos commits
git push origin feat/v2-rebuild            # enviar mudanças
```

Quando v2 estiver completa e validada:
```bash
git checkout main
git reset --hard origin/feat/v2-rebuild   # OU: merge, sua escolha
```

## Notas Importantes

- **MCP foi cortado** do escopo. Não tem mais `services/mcp/`.
- **OAuth foi cortado**. Auth é só por API key.
- **RLS ativa**. Queries sem `SET LOCAL app.current_user_id` retornam 0 rows.
- **Bcrypt/argon2id** nas senhas e API keys.
- **Embeddings** server-side via OpenAI (chave em 1 lugar só, server).

## Histórico de Decisões

Ver `docs/specs/` (quando existir) ou mensagens de commit — conventional commits documentam o porquê de cada mudança.
