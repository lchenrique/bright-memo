# Bright Memo Architecture

## Purpose

Bright Memo stores durable project context for humans and coding agents. API owns persistence, auth and retrieval. CLI and operational skill expose that API. Active agent remains responsible for interpretation and verification.

## Monorepo

```text
apps/api       Fastify REST API, Drizzle, PostgreSQL
apps/cli       Commander CLI and packaged bright-memory skill
apps/web       Next.js web client
packages/shared  Zod contracts and shared TypeScript types
docker         PostgreSQL 16 with pgvector
scripts        DB, smoke, install and E2E gates
```

Runtime is Node `22.23.1`; package manager is pnpm `11.14.0`.

## Auth and isolation

- API clients use Bearer keys prefixed with `bm_`.
- Initial key creation uses `X-Bootstrap-Token`.
- Keys are hashed with argon2id before storage.
- `bright_app` runs normal requests with forced RLS.
- Each request sets `app.current_user_id` in a transaction.
- `bright_service` bypasses RLS only for auth/bootstrap flows.
- Missing DB user context sees no rows.

## Retrieval

Lexical retrieval is baseline and always available:

1. `to_tsvector('simple', content)` and `plainto_tsquery` provide token search suitable for code and multilingual content.
2. `pg_trgm` similarity handles approximate and partial matches.
3. Case-insensitive substring matching gives exact phrase/path priority.
4. User, project and tag filters run inside SQL before ranking.

If a server-side OpenAI key is configured, query and memory embeddings provide a second ranking list. Reciprocal rank fusion combines rank positions; raw lexical and vector scores are never mixed. Provider absence, timeout, invalid response or HTTP failure returns lexical results.

`memories.embedding` is nullable retrieval data. Legacy zero vectors are migrated to `NULL`. Search responses omit vectors.

## Database migrations

- `0000_initial_schema`: users, keys, projects and memories.
- `0001_indexes`: HNSW, tags and access-path indexes.
- `0002_rls`: roles, grants and forced row-level security.
- `0003_lexical_search`: nullable embeddings, zero-vector cleanup, `pg_trgm`, FTS and trigram indexes.

`db:deploy` acquires an advisory lock, creates required extensions and roles, applies migrations, then validates schema, indexes, RLS and migration journal. Repeated execution is supported.

## CLI and skill

Commands `init`, `status`, `search`, `save` and `list` support `--json`. JSON mode writes one JSON value to stdout and exits non-zero with JSON errors. Memory commands resolve and send an owned `projectId`; no implicit cross-project search occurs when CLI project config exists.

`bm skill install` copies packaged `bright-memory` assets to:

- OpenCode: `~/.config/opencode/skills/bright-memory`
- Codex: `~/.agents/skills/bright-memory`
- Claude Code: `~/.claude/skills/bright-memory`

MCP is not part of current architecture.
