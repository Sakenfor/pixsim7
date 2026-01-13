/**
 * API Error Handling Utilities
 *
 * Re-exports error handling utilities from @pixsim7/shared.api-client.
 * This module is kept for backward compatibility with existing imports.
 *
 * For new code, prefer importing directly from @pixsim7/shared.api-client.
 */

// Re-export all error handling utilities from the api-client package
export {
  // Core error extraction
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
} from '@pixsim7/shared.api-client';

// Re-export types
export type { ErrorResponse, ErrorCode } from '@pixsim7/shared.api-client';
