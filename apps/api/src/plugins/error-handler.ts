/**
 * Global error handler.
 *
 * Maps thrown errors to the shared `errorResponseSchema` shape so the
 * client always sees:
 *
 *   { error: { code, message, details? }, requestId }
 *
 * The mapping rules:
 *   1. ZodError            → 422 VALIDATION_ERROR  (includes issue list)
 *   2. Fastify validation  → 400 VALIDATION_ERROR  (already in issues)
 *   3. Anything with statusCode ≥ 400 → pass through
 *   4. Anything else        → 500 SERVER_ERROR     (message generic)
 *
 * Always logs with the request id so we can correlate with access logs.
 */

import { ERROR_CODES, type ErrorCode } from '@bright-memo/shared';
import { ZodError } from 'zod';
import type { FastifyError, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((err: FastifyError | ZodError | Error, req: FastifyRequest, reply) => {
    const requestId = req.id;

    // 1. Zod errors from manual validation in routes.
    if (err instanceof ZodError) {
      req.log.warn({ err, requestId }, 'validation failed');
      return reply.status(422).send({
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'request body failed validation',
          details: { issues: err.issues },
        },
        requestId,
      });
    }

    // 2. Fastify-issued errors (validation, 404, etc.) — they have a
    //    statusCode and a code like 'FST_ERR_VALIDATION'.
    const fastifyErr = err as FastifyError & {
      validation?: unknown;
      code?: string;
    };
    if (typeof fastifyErr.statusCode === 'number' && fastifyErr.statusCode >= 400) {
      const status = fastifyErr.statusCode;
      const code: ErrorCode = mapStatusToCode(status);
      req.log.warn({ err, requestId, status }, 'fastify error');
      return reply.status(status).send({
        error: {
          code,
          message: fastifyErr.message || 'request failed',
          details: fastifyErr.validation ? { issues: fastifyErr.validation } : undefined,
        },
        requestId,
      });
    }

    // 3. Unhandled — log loudly, return a generic 500.
    req.log.error({ err, requestId }, 'unhandled error');
    return reply.status(500).send({
      error: {
        code: ERROR_CODES.SERVER_ERROR,
        message: 'internal server error',
      },
      requestId,
    });
  });

  fastify.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: `route ${req.method} ${req.url} not found`,
      },
      requestId: req.id,
    });
  });
};

function mapStatusToCode(status: number): ErrorCode {
  if (status === 401) return ERROR_CODES.UNAUTHORIZED;
  if (status === 403) return ERROR_CODES.FORBIDDEN;
  if (status === 404) return ERROR_CODES.NOT_FOUND;
  if (status === 409) return ERROR_CODES.CONFLICT;
  if (status === 422) return ERROR_CODES.VALIDATION_ERROR;
  if (status === 429) return ERROR_CODES.RATE_LIMITED;
  return ERROR_CODES.SERVER_ERROR;
}

export default fp(errorHandlerPlugin, { name: 'error-handler' });
