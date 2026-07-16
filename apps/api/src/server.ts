/**
 * Fastify server boot.
 *
 * Plugin order matters:
 *   1. error-handler   — registered first so any later error is mapped
 *   2. cors            — must be before routes
 *   3. auth            — global onRequest hook that resolves api keys
 *   4. db-context      — depends on req.user; runs after auth
 *   5. routes          — last
 */

import cors from '@fastify/cors';
import Fastify from 'fastify';

import { getEnv } from './config/env.js';
import authPlugin from './plugins/auth.js';
import dbContextPlugin from './plugins/db-context.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import healthRoutes from './routes/health.js';
import keysRoutes from './routes/auth/keys.js';
import meRoutes from './routes/auth/me.js';
import memoriesRoutes from './routes/memories.js';
import projectsRoutes from './routes/projects.js';

async function buildServer() {
  const env = getEnv();
  const isDev = env.NODE_ENV === 'development';

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: isDev
        ? {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss.l' },
          }
        : undefined,
    },
    genReqId: (req) =>
      req.headers['x-request-id']?.toString() ??
      `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  });

  await app.register(errorHandlerPlugin);
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow non-browser requests (curl, server-to-server) and anything
      // in the configured allowlist.
      if (!origin) return cb(null, true);
      if (env.APP_URL.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  });
  await app.register(authPlugin);
  await app.register(dbContextPlugin);

  await app.register(healthRoutes);
  await app.register(keysRoutes);
  await app.register(meRoutes);
  await app.register(memoriesRoutes);
  await app.register(projectsRoutes);

  return app;
}

async function main(): Promise<void> {
  const env = getEnv();
  const app = await buildServer();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    const address = await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info({ address, env: env.NODE_ENV }, `bright-memo api listening on ${address}`);
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  }
}

void main();
