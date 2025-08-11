// src/utils/asyncHandler.js

/**
 * Express async wrapper that catches rejected promises and passes to next()
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
export const asyncHandler = (fn) => 
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };