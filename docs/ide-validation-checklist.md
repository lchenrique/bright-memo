# Bright Memo v2 — IDE Validation Checklist

Checklist para validar que o ambiente local está funcional antes de começar a codar.

## Pré-requisitos

- [ ] Docker Desktop instalado e rodando
- [ ] Node.js >= 20 (ver `.nvmrc`)
- [ ] pnpm 11 instalado (`corepack enable && corepack prepare pnpm@11.0.0-beta.2 --activate`)
- [ ] Arquivo `.env` existe na raiz (ou `docker/.env` com `DB_PASS=changeme`)
- [ ] `apps/api/.env` configurado (ver `docs/dev-quickstart.md`)

## Setup rápido

```bash
# 1. Instalar dependências
pnpm install

# 2. Subir Postgres + pgvector
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml ps
# Aguardar status "healthy"

# 3. Rodar migrations
pnpm db:migrate

# 4. Criar user dev + API key
pnpm db:bootstrap

# 5. Build CLI
pnpm --filter @bright-memo/cli build

# 6. Subir API (em outro terminal)
pnpm --filter @bright-memo/api dev
```

## Verificação rápida

- [ ] `curl http://localhost:3001/health` → 200 `{"status":"ok","db":"up",...}`
- [ ] `curl -i http://localhost:3001/v1/me` → 401 UNAUTHORIZED
- [ ] `curl -H "Authorization: Bearer $(cat apps/api/.dev-key)" http://localhost:3001/v1/me` → 200 + user data
- [ ] `pnpm tsx scripts/smoke-test.ts` → exit 0

## Smoke test

- [ ] `pnpm tsx scripts/smoke-test.ts --help` mostra flags
- [ ] `pnpm tsx scripts/smoke-test.ts` roda sem erros

## CLI

- [ ] `node apps/cli/dist/index.js version` → `0.1.0`
- [ ] `node apps/cli/dist/index.js status --help` mostra help
- [ ] `node apps/cli/dist/index.js config set --help` mostra help
- [ ] `pnpm --filter @bright-memo/cli build` → exit 0 (sem erros TS)

## Troubleshooting

| Problema                                | Causa                                      | Solução                                                                   |
| --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Porta 5432 ocupada                      | Outro Postgres rodando local               | `docker compose -f docker/docker-compose.yml down` ou parar serviço local |
| Docker compose ps mostra "unhealthy"    | Postgres ainda iniciando                   | Aguardar 10s e rodar `docker compose ps` novamente                        |
| `pnpm db:migrate` falha                 | Container não está healthy                 | Verificar `pnpm db:logs`                                                  |
| API não sobe na 3001                    | Porta ocupada                              | `netstat -ano                                                             | findstr :3001` e matar processo |
| Curl `/v1/me` retorna 0 rows            | RLS ativo sem `app.current_user_id` setado | Verificar se a API key é válida                                           |
| Curl `/v1/me` retorna 401 mesmo com key | `.dev-key` contém JSON, não string         | Usar `jq -r .apiKey apps/api/.dev-key` ou extrair manualmente             |
| CLI `bm version` falha                  | CLI não foi buildado                       | Rodar `pnpm --filter @bright-memo/cli build`                              |
| `pnpm install` erro de lockfile         | pnpm version mismatch                      | `corepack enable && corepack prepare`                                     |
