// src/middleware/error.js
import { AppError } from '../errors/index.js';

/**
 * Centralized error middleware for Express
 * Handles all errors and provides structured logging + safe JSON responses
 */
export function errorMiddleware(err, req, res, _next) {
  const isApp = err instanceof AppError;
  const status = isApp ? err.status : 500;
  const code = isApp ? err.code : 'UNHANDLED_ERROR';
  const message = isApp ? err.message : (err?.message ?? 'Unexpected error');

  // Structured log, once
  console.error('❌ Error', {
    route: `${req.method} ${req.originalUrl}`,
    status,
    code,
    message,
    meta: isApp ? err.meta : undefined,
    stack: err?.stack,
    cause: err?.cause?.stack || err?.cause?.message,
    requestId: req?.id
  });

  res.status(status).json({ error: { code, message } });
}