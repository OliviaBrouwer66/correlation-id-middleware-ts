/**
 * Public entry point for correlation-id-middleware-ts.
 *
 * Re-exports the middleware factory and the standalone helpers so callers can
 * import everything from the package root.
 */

export { createCorrelationIdMiddleware, isUuid, uuid } from './core.js';
