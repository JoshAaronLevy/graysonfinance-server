// src/errors/index.js
export const ErrorMeta = {}; // Type placeholder for JSDoc

export class AppError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name = 'AppError';
    this.code = opts.code ?? 'APP_ERROR';
    this.status = opts.status ?? 500;
    this.meta = opts.meta;
    
    // Add cause support for Node.js >= 16.9
    if (opts.cause) {
      this.cause = opts.cause;
    }
    
    Error.captureStackTrace?.(this, AppError);
  }
}

export class ValidationError extends AppError {
  constructor(message, meta, cause) {
    super(message, { code: 'VALIDATION_ERROR', status: 400, cause, meta });
    this.name = 'ValidationError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(service, message, meta, cause) {
    super(`[${service}] ${message}`, { code: 'EXTERNAL_SERVICE_ERROR', status: 502, cause, meta });
    this.name = 'ExternalServiceError';
  }
}

/**
 * Helper to attach context while preserving original error/stack
 * @param {string} ctx - Context description
 * @param {unknown} err - Original error
 * @param {object} meta - Additional metadata
 * @param {number} status - HTTP status code override
 * @returns {AppError} Wrapped error with context
 */
export function wrapError(ctx, err, meta, status) {
  if (err instanceof AppError) {
    // Append context once; avoid message explosion
    return new AppError(`${ctx}: ${err.message}`, { 
      code: err.code, 
      status: status ?? err.status, 
      cause: err, 
      meta: { ...err.meta, ...meta } 
    });
  }
  
  const message = err instanceof Error ? err.message : String(err);
  return new AppError(`${ctx}: ${message}`, { 
    status: status ?? 500, 
    cause: err, 
    meta 
  });
}