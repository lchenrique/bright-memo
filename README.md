# Bright Memo v2

Memória compartilhada entre humanos e agentes IA.

Monorepo com API Fastify, CLI Bun, web Next.js e pacote compartilhado de tipos/schemas.

## Desenvolvimento

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm lint:all
pnpm test:all
pnpm build:all
```

Deploy da API e banco: `docs/coolify-deploy.md`.
