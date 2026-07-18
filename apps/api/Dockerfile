ARG NODE_VERSION=22.23.1
ARG PNPM_VERSION=11.14.0

FROM node:${NODE_VERSION}-alpine AS build
ARG PNPM_VERSION
ENV HUSKY=0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @bright-memo/api...

COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN pnpm --filter @bright-memo/shared build \
  && pnpm --filter @bright-memo/api build \
  && pnpm --filter @bright-memo/api --prod deploy /opt/bright-memo-api

FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build --chown=node:node /opt/bright-memo-api ./

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "dist/server.js"]
