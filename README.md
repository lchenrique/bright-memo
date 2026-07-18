# Bright Memo v0.2.1

Memoria duravel para humanos e agentes de programacao. Bright Memo oferece API REST, CLI e uma skill operacional instalavel. O agente ativo interpreta os resultados; o servidor nao depende de um segundo modelo.

## Busca model-agnostic

- PostgreSQL full-text search e `pg_trgm` funcionam sem `OPENAI_API_KEY`.
- Embeddings OpenAI sao opcionais e usados apenas para melhorar ranking.
- Ausencia, timeout ou falha do provider degrada para busca lexical, nunca para erro `502`.
- Saves sem provider armazenam `embedding = NULL`; nenhum vetor zero e criado.
- Resultados de search nunca expoem embeddings.

## Desenvolvimento

Requisitos fixados: Node `22.23.1`, pnpm `11.14.0`, Docker e PostgreSQL 16 com pgvector.

```bash
corepack enable
pnpm install --frozen-lockfile
docker compose -f docker/docker-compose.yml up -d --wait
pnpm db:deploy
pnpm lint:all
pnpm test:all
pnpm build:all
```

Copie `apps/api/.env.example` para `apps/api/.env` e troque todos os placeholders. `OPENAI_API_KEY` pode permanecer ausente.

## CLI

```bash
pnpm --filter @bright-memo/cli build
node apps/cli/dist/index.js init --api-url http://localhost:3001 \
  --email dev@example.com --bootstrap-token <token> \
  --project-name bright-memo --project-alias bright-memo --json
node apps/cli/dist/index.js status --json
node apps/cli/dist/index.js save "decisao duravel" --project bright-memo --tags architecture --json
node apps/cli/dist/index.js search "decisao" --project bright-memo --json
node apps/cli/dist/index.js list --project bright-memo --json
```

Env overrides suportados: `BRIGHT_MEMO_API_URL` e `BRIGHT_MEMO_API_KEY`. Chaves Bright comecam em `bm_`; elas nao sao chaves de IA.

Instale a skill para o agente:

```bash
node apps/cli/dist/index.js skill install --client opencode --json
# clients: opencode, codex, claude, auto
```

## Documentacao

- Arquitetura: [`docs/architecture.md`](docs/architecture.md)
- Setup e validacao: [`docs/dev-quickstart.md`](docs/dev-quickstart.md)
- Coolify: [`docs/coolify-deploy.md`](docs/coolify-deploy.md)
- Skill operacional: [`SKILL.md`](SKILL.md)
