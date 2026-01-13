/**
 * API Client - Frontend API for backend services
 */

// Note: `apiClient` is legacy (AxiosResponse-returning) and kept for backward compatibility.
// Prefer `pixsimClient` (data-returning) or `@pixsim7/shared.api-client/domains` for reusable domain clients.
export { apiClient, pixsimClient, BACKEND_BASE, API_BASE_URL } from './client';
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
