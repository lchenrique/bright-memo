# Coolify deploy: Bright Memo v0.2.0

Este runbook prepara os recursos que serão criados no Coolify após commit, push e tag. Não use `db:bootstrap` em produção.

## Recursos

1. PostgreSQL 16 com pgvector disponível.
2. Aplicação Docker usando contexto do repositório e `apps/api/Dockerfile`.
3. Rede privada entre aplicação e banco.

Faça backup ou habilite point-in-time restore antes de aplicar migrations em banco com dados.

## Variáveis do banco

Configure URLs para o mesmo banco com três roles distintas:

```dotenv
DATABASE_URL=<admin-or-migration-postgres-url>
APP_DATABASE_URL=postgres://bright_app:<app-role-password>@<database-host>:5432/<database-name>
SERVICE_DATABASE_URL=postgres://bright_service:<service-role-password>@<database-host>:5432/<database-name>
```

`DATABASE_URL` precisa criar extensão, roles e schema. `bright_app` permanece sem `BYPASSRLS`; `bright_service` usa `BYPASSRLS` apenas nos fluxos de auth/bootstrap da API.

## Variáveis da API

```dotenv
NODE_ENV=production
PORT=3001
LOG_LEVEL=info
APP_URL=<comma-separated-allowed-web-origins>
BOOTSTRAP_TOKEN_SECRET=<random-secret-at-least-32-characters>
OPENAI_API_KEY=<optional-openai-key>
```

Nunca reutilize placeholders. Não exponha `DATABASE_URL`, passwords, bootstrap token ou OpenAI key em logs/build args.

## Build e comandos

- Build context: raiz do repositório.
- Dockerfile: `apps/api/Dockerfile`.
- Pre-deploy command: `node dist/db/deploy.js`.
- Start command: use `CMD` da imagem, `node dist/server.js`.
- Health check: `GET /health`, porta `3001`, esperado `200` com `db: "up"`.

`db:deploy` é idempotente. Ele adquire advisory lock, habilita `vector`, cria ou atualiza as roles usando as URLs, aplica `0000` a `0002` e valida tabelas, journal, roles, policies e `FORCE ROW LEVEL SECURITY`.

## Smoke

Após deploy:

```bash
curl -i <api-base-url>/health
curl -i <api-base-url>/v1/me
```

Critérios:

- `/health`: HTTP 200, `status: "ok"`, `db: "up"`, `version: "0.2.0"`.
- `/v1/me` sem Authorization: HTTP 401.
- Reinício/stop: processo encerra com SIGTERM sem `ERR_MODULE_NOT_FOUND` para `@bright-memo/shared`.

Se migration falhar, não inicie nova versão da API. Preserve logs sem URLs/segredos, restaure backup quando necessário e corrija a causa antes de repetir `node dist/db/deploy.js`.
