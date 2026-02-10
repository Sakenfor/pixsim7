/**
 * API Client - Frontend API for backend services
 *
 * Use `pixsimClient` for all API requests. It returns data directly (no `.data` unwrapping needed).
 * For reusable domain clients, see `@pixsim7/shared.api.client/domains`.
 */
export { pixsimClient, BACKEND_BASE, API_BASE_URL } from './client';
export {
  // Error message extraction
  extractErrorMessage,
  getErrorResponse,
  getErrorCode,
  isErrorCode,
  isErrorResponse,

  // Validation errors
  getValidationErrors,
  getFieldError,
  isValidationError,

  // HTTP status checks
  isHttpError,
  isNetworkError,
  getErrorStatusCode,

  // Common error type checks
  isUnauthorizedError,
  isNotFoundError,
  isConflictError,

  // Error codes
  ErrorCodes,
} from './errorHandling';

// Re-export types
export type { ErrorResponse, ErrorCode } from './errorHandling';

// Domain clients
export * from './game';
export * from './accounts';
export * from './actionBlocks';
export * from './assets';
export * from './automation';
export * from './composition';
export * from './concepts';
export * from './interactions';
export * from './generations';
export * from './generationOperations';
export * from './analyzers';
export * from './userPreferences';

// Note: __simulate_extend.ts NOT exported (test utility)
