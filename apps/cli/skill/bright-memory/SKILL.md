---
name: bright-memory
description: Use Bright Memo through its model-agnostic CLI or REST API to recall and save durable coding-project context. Search before claims about prior work; do not use it as proof.
compatibility: OpenCode, Codex, Claude Code, and Agent Skills compatible coding agents
metadata:
  product: bright-memo
  transport: cli-rest
---

# Bright Memory

Use Bright Memo as project recall. Active coding agent interprets results. No MCP or secondary AI provider required.

## Start

1. Run `bm status --json`.
2. If auth or project is missing, run `bm init` with API URL, email, and bootstrap token supplied by operator.
3. Bright API keys start with `bm_`; they authenticate Bright and are not model/provider keys.

## Recall

- Search before asserting prior decisions, bugs, fixes, commands, files, or next steps:
  `bm search "<specific query>" --project <alias> --json`
- Memory is recall, not proof. Verify current repository, runtime, tests, and external state.
- Keep full JSON available to active model. `score` is ranking only, never confidence.

## Save

Save only durable, reusable facts: technical decisions and reasons, confirmed bugs and fixes, useful commands or paths, and validated next steps.

Use `bm save "<fact>" --project <alias> --tags <tags> --json`.

Never save secrets, credentials, tokens, private keys, large logs, raw transcripts, or temporary thoughts.

## REST fallback

If `bm` is unavailable, use generic HTTP with operator-provided environment variables:

```sh
curl -fsS \
  -H "Authorization: Bearer $BRIGHT_MEMO_API_KEY" \
  "$BRIGHT_MEMO_API_URL/v1/memories/search?q=<url-encoded-query>&projectId=<uuid>&limit=20"
```

Save with `POST /v1/memories` JSON containing `projectId`, `content`, `source`, and `tags`.
Do not send an OpenAI key. Lexical search is always available; optional server embeddings only improve ranking.
