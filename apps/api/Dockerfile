# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci --include=dev
COPY . .
RUN npm run build --workspace=@bright-memo/shared
RUN npm run build --workspace=@bright-memo/api

# Stage 2: Production (keep all deps to avoid missing transitive)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Copy entire builder output - simpler and avoids missing deps
COPY --from=builder /app .

WORKDIR /app/apps/api

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
