# Coolify deploy: Bright Memo v0.2.1

Runbook only. Do not run `db:bootstrap` in production.

## Resources

1. PostgreSQL 16 with pgvector available.
2. Docker application built from repository root with `apps/api/Dockerfile`.
3. Private network between API and database.

Create a backup or point-in-time restore point before migration.

## Database variables

```dotenv
DATABASE_URL=<admin-or-migration-postgres-url>
APP_DATABASE_URL=postgres://bright_app:<app-role-password>@<database-host>:5432/<database-name>
SERVICE_DATABASE_URL=postgres://bright_service:<service-role-password>@<database-host>:5432/<database-name>
```

All URLs target same database. Admin URL must create extensions, roles and schema. `bright_app` uses forced RLS; `bright_service` bypasses RLS only for auth/bootstrap.

## API variables

```dotenv
NODE_ENV=production
PORT=3001
LOG_LEVEL=info
APP_URL=<comma-separated-allowed-web-origins>
BOOTSTRAP_TOKEN_SECRET=<random-secret-at-least-32-characters>
# OPENAI_API_KEY=<optional-ranking-provider-key>
```

`OPENAI_API_KEY` is optional. Missing or failing provider leaves API healthy: memories store nullable embeddings and search uses PostgreSQL FTS/trigram ranking. Never expose database URLs, passwords, bootstrap tokens or provider keys in logs/build args.

## Build and commands

- Build context: repository root.
- Dockerfile: `apps/api/Dockerfile`.
- Pre-deploy: `node dist/db/deploy.js`.
- Start: image `CMD`, `node dist/server.js`.
- Health check: `GET /health` on port `3001`.

`db:deploy` is idempotent. It acquires an advisory lock, enables `vector` and `pg_trgm`, creates or rotates roles, applies migrations `0000` through `0003`, then validates tables, nullable embeddings, zero-vector cleanup, lexical/vector indexes, journal, roles, policies and forced RLS.

## Smoke criteria

```bash
curl -i <api-base-url>/health
curl -i <api-base-url>/v1/me
```

- `/health`: HTTP `200`, `status: "ok"`, `db: "up"`, version `0.2.1`.
- `/v1/me` without Authorization: HTTP `401`.
- Search without `OPENAI_API_KEY`: HTTP `200`, mode `lexical`, no embedding fields.
- Restart/stop: clean shutdown, no `ERR_MODULE_NOT_FOUND` for `@bright-memo/shared`.

If migration fails, do not start new API version. Preserve sanitized logs, restore backup when needed, fix root cause, then rerun pre-deploy.
