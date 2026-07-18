# Bright Memo v2 — Dev Quickstart

Guia de setup local e validação da release v0.2.0.

> Documento vivo. Para arquitetura/decisões, ver `README.md` + mensagens de commit (conventional).

## TL;DR

```bash
pnpm install --frozen-lockfile
docker compose -f docker/docker-compose.yml up -d
pnpm db:deploy
pnpm db:bootstrap       # gera apps/api/.dev-key
pnpm --filter @bright-memo/api dev   # API :3001
pnpm --filter @bright-memo/web dev   # Web :3000 (signup/login/dashboard)
pnpm --filter @bright-memo/cli build && node apps/cli/dist/index.js --help   # CLI
```

## Estrutura

```
bright-memo/
├── apps/
│   ├── api/         Fastify + Drizzle, porta 3001
│   ├── cli/         binário Node/Bun, comandos: config init install list save search status sync version
│   └── web/         Next.js 15, porta 3000, UI mínima de auth + dashboard
├── packages/
│   └── shared/      tipos + Zod schemas + constants (fonte única de contratos)
├── docker/
│   ├── docker-compose.yml      Postgres 16 + pgvector
│   └── postgres.conf
├── scripts/
│   ├── db-bootstrap.ts         cria dev user + key
│   ├── db-reset.ts             drop + deploy (pede confirmação)
│   ├── install.ts              install flow das 4 fases (CLI standalone)
│   ├── install-reset.ts        limpa estado do install
│   ├── smoke-test.ts           smoke do API + DB
│   └── e2e-gate.ts             gate E2E (install → save → search → context)
├── .github/
│   └── workflows/              CI.yml + e2e.yml
├── apps/api/Dockerfile         build prod pro Coolify
├── SKILL.md                    skill da Bright Memo (root)
└── docs/                       você está aqui
```

## Setup Detalhado

### 1. Dependências

```bash
pnpm install --frozen-lockfile
```

Build dependencies limitadas (`esbuild`) por causa de permissoes no pnpm 11.

### 2. Banco

```bash
pnpm db:up          # sobe Postgres 16 + pgvector na 5432
pnpm db:deploy      # vector + roles + 3 migrations + validação de RLS
pnpm db:bootstrap   # cria dev user (dev@brightmemo.local) + API key em apps/api/.dev-key
```

Reset (apaga tudo e recria):

```bash
pnpm db:reset       # confirma, recria DB, roda deploy, pede bootstrap
```

### 3. API

```bash
pnpm --filter @bright-memo/api dev
# Listening em http://localhost:3001
```

Crie `.env` em `apps/api/`:

```bash
cp apps/api/.env.example apps/api/.env
# editar BOOTSTRAP_TOKEN_SECRET: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# editar DATABASE_URL se necessário
# OPENAI_API_KEY (opcional — server-side embeddings)
```

### 4. Web

```bash
pnpm --filter @bright-memo/web dev
# http://localhost:3000
```

Páginas: `/login`, `/signup`, `/dashboard`, `/dashboard/projects`, `/dashboard/memories`, `/dashboard/search`, `/dashboard/settings`.

### 5. CLI (instalável standalone)

```bash
pnpm --filter @bright-memo/cli build
node apps/cli/dist/index.js --help
```

Ou rodar via Node sem build:

```bash
tsx apps/cli/src/index.ts --help
```

#### Comandos CLI

| Comando          | O que faz                                       |
| ---------------- | ----------------------------------------------- |
| `config`         | ver/editar config local                         |
| `init`           | criar/identificar projeto no Bright Memo        |
| `install`        | instalar skill + CLI nas IDEs detectadas        |
| `list`           | listar memórias do projeto atual                |
| `save <texto>`   | salvar memória nova (com embedding server-side) |
| `search <query>` | busca semântica                                 |
| `status`         | diagnóstico (key, user, projeto, IDEs)          |
| `sync`           | sincronizar contexto                            |
| `version`        | versão do CLI                                   |

## Verificação Rápida

```bash
# Health (sem auth)
curl http://localhost:3001/health
# {"status":"ok","db":"up",...}

# /me com dev key
curl -H "Authorization: Bearer $(cat apps/api/.dev-key)" http://localhost:3001/v1/me

# Criar key nova via bootstrap (precisa BOOTSTRAP_TOKEN_SECRET)
curl -X POST \
  -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@x.com","name":"Teste"}' \
  http://localhost:3001/v1/auth/keys

# Smoke test (roda via script)
pnpm exec tsx scripts/smoke-test.ts

# E2E gate (install → save → search → context)
tsx scripts/e2e-gate.ts
```

## Comandos Úteis

```bash
# DB
pnpm db:up / db:down / db:logs / db:psql
pnpm db:deploy / db:reset / db:bootstrap

# Quality
pnpm lint:all
pnpm test:all
pnpm build:all
pnpm format   # prettier write em tudo

# Por app
pnpm --filter @bright-memo/api <script>
pnpm --filter @bright-memo/cli <script>
pnpm --filter @bright-memo/web <script>
pnpm --filter @bright-memo/shared <script>
```

## Variáveis de Ambiente

### `apps/api/.env`

```bash
PORT=3001
DATABASE_URL=postgres://bright:<admin-password>@localhost:5432/bright_memo
APP_DATABASE_URL=postgres://bright_app:<app-password>@localhost:5432/bright_memo
SERVICE_DATABASE_URL=postgres://bright_service:<service-password>@localhost:5432/bright_memo
NODE_ENV=development
LOG_LEVEL=info
APP_URL=http://localhost:3001
BOOTSTRAP_TOKEN_SECRET=<openssl rand -hex 32>
OPENAI_API_KEY=sk-...    # embeddings server-side
```

### `apps/web/.env.local`

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
API_INTERNAL_URL=http://localhost:3001
COOKIE_SECRET=<random>
```

### `apps/cli/.env` (opcional, env globals funcionam)

```bash
BRIGHT_MEMO_API_KEY=bm_xxx
BRIGHT_MEMO_API_URL=http://localhost:3001
```

## Branch e Push

```bash
# Branch atual: release/v0.2.0
# Remote: github.com/lchenrique/bright-memo
# Release alvo: v0.2.0

git status
git log --oneline -20
git push origin release/v0.2.0

# Em outro PC:
git clone https://github.com/lchenrique/bright-memo.git
git checkout release/v0.2.0
pnpm install --frozen-lockfile && pnpm db:up && pnpm db:deploy && pnpm db:bootstrap
```

## Deploy (Coolify)

Use `docs/coolify-deploy.md`. Produção roda `node dist/db/deploy.js` antes da API e nunca roda `db:bootstrap`.

```bash
docker build -f apps/api/Dockerfile -t bright-memo-api:v0.2.0 .
docker run -p 3001:3001 --env-file apps/api/.env bright-memo-api
```

Web tem `next.config.ts` standalone. Build:

```bash
pnpm --filter @bright-memo/web build
```

## Estado Atual (release v0.2.0)

Tag em commit `713504a feat(web): t-047..t-051 next.js app...`.

### Pronto para revisão em `release/v0.2.0`

| Task          | Descrição                                                                      |
| ------------- | ------------------------------------------------------------------------------ |
| T-001 → T-006 | Monorepo + Husky + shared package (tipos/Zod/constants)                        |
| T-007 → T-012 | DB infra (Docker + Drizzle + 3 migrations + RLS + bootstrap)                   |
| T-013 → T-018 | API auth (Fastify + plugins auth/db-context + /auth/keys + /me)                |
| T-019         | API projects CRUD (com gate pré-T-019)                                         |
| T-020         | API memories CRUD                                                              |
| T-021 → T-024 | API search + OpenAI embeddings server-side                                     |
| T-025 → T-035 | CLI binário (init, save, list, search, status, sync, install, config, version) |
| T-036 → T-042 | Install flow CLI (4 fases: key, IDE detect, project, marker)                   |
| T-043         | SKILL.md (root)                                                                |
| T-044 → T-046 | Smoke test + E2E gate + IDE checklist + CI workflows                           |
| T-047 → T-051 | Web Next.js (login, signup, dashboard, projects, memories, search, settings)   |
| +             | Dockerfile Coolify                                                             |
| +             | .github/workflows (ci.yml + e2e.yml)                                           |

### Pendente / Melhorias futuras

- Refactor/cleanup de imports não usados em API
- Migração completa de v1 (main) → main v2 (force-push ou merge)
- CHANGELOG.md formal com notas de release
- MFA no web signup
- Sync streaming entre devices
- Embedding model alternativo (Voyage, Cohere) — benchmark

## Notas Importantes

- **MCP cortado.** Sem `services/mcp/` nesta branch.
- **OAuth cortado.** Auth é só por API key (CLI) ou email+senha (web).
- **RLS ativa.** Sem `SET LOCAL app.current_user_id`, queries retornam 0 rows.
- **Service role** (`bright_service` no DB) faz bypass pra criação de users via `/auth/keys`.
- **Embeddings** server-side via OpenAI. Chave em `apps/api/.env`. Nunca no client.
- **Husky pre-commit** roda lint-staged (prettier + eslint). Pode falhar em CI sem TTY — usar `--no-verify` se necessário.

## Histórico

Ver `git log --oneline` e conventional commits. Cada task tem mensagem documentando o porquê.
