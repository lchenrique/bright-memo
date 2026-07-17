# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci --include=dev

# Stage 2: Build
FROM node:22-alpine AS builder
WORKDIR /app
# Copy everything from deps (includes apps/api/node_modules, packages/shared/node_modules)
COPY --from=deps /app ./
# Then overwrite source with fresh copy
COPY . .
RUN npm run build --workspace=@bright-memo/shared
RUN npm run build --workspace=@bright-memo/api

# Stage 3: Production
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules

# Remove devDependencies after build
RUN npm prune --omit=dev

WORKDIR /app/apps/api

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
