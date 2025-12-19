/**
 * API Error Handling Utilities
 *
 * Environment-neutral error extraction and formatting for API responses.
 * Works with the standardized ErrorResponse format.
 */
import type { AxiosError } from 'axios';
import type { ErrorResponse, ErrorCode } from './types';
import { ErrorCodes } from './types';

/**
 * Check if a value is an API error response.
 */
export function isErrorResponse(value: unknown): value is ErrorResponse {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.code === 'string' && typeof obj.message === 'string';
}

/**
 * Extract error response from an axios error.
 *
 * @param error - The error to extract from
 * @returns The ErrorResponse if available, null otherwise
 */
export function getErrorResponse(error: unknown): ErrorResponse | null {
  const axiosError = error as AxiosError<ErrorResponse>;
  if (axiosError.response?.data && isErrorResponse(axiosError.response.data)) {
    return axiosError.response.data;
  }
  return null;
}

/**
 * Extract a user-friendly error message from any error.
 *
 * Handles:
 * - Axios errors with ErrorResponse body
 * - Axios errors with legacy detail field
 * - Standard Error objects
 * - String errors
 * - Unknown error types
 *
 * @param error - The error to extract message from
 * @param fallback - Default message if extraction fails
 * @returns User-friendly error message
 *
 * @example
 * ```ts
 * try {
 *   await client.post('/assets', data);
 * } catch (err) {
 *   const message = extractErrorMessage(err, 'Failed to upload asset');
 *   showToast({ type: 'error', message });
 * }
 * ```
 */
export function extractErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  // Handle null/undefined
  if (!error) {
    return fallback;
  }

  // Try to get standardized ErrorResponse first
  const errorResponse = getErrorResponse(error);
  if (errorResponse) {
    // Return detail if available, otherwise message
    return errorResponse.detail ?? errorResponse.message;
  }

  // Try Axios error with legacy detail shape
  const axiosError = error as AxiosError<{ detail?: string | string[] }>;
  if (axiosError.response?.data?.detail) {
    const detail = axiosError.response.data.detail;
    if (Array.isArray(detail)) {
      return detail.join(', ');
    }
    return String(detail);
  }

  // Try standard Error object
  if (error instanceof Error) {
    return error.message || fallback;
  }

  // Try plain object with message property
  const errorObj = error as { message?: string };
  if (errorObj.message) {
    return errorObj.message;
  }

  // Try converting to string
  if (typeof error === 'string') {
    return error;
  }

  return fallback;
}

/**
 * Get the error code from an API error.
 *
 * @param error - The error to extract code from
 * @returns The error code or null if not available
 */
export function getErrorCode(error: unknown): ErrorCode | string | null {
  const errorResponse = getErrorResponse(error);
  return errorResponse?.code ?? null;
}

/**
 * Check if an error matches a specific error code.
 *
 * @param error - The error to check
 * @param code - The error code to match
 * @returns True if the error matches the code
 *
 * @example
 * ```ts
 * if (isErrorCode(err, ErrorCodes.VALIDATION_ERROR)) {
 *   // Handle validation error, show field errors
 * }
 * ```
 */
export function isErrorCode(error: unknown, code: ErrorCode | string): boolean {
  return getErrorCode(error) === code;
}

/**
 * Get field-level validation errors from an API error.
 *
 * @param error - The error to extract fields from
 * @returns Array of field errors or empty array
 */
export function getValidationErrors(
  error: unknown
): Array<{ loc: (string | number)[]; msg: string; type: string }> {
  const errorResponse = getErrorResponse(error);
  return errorResponse?.fields ?? [];
}

/**
 * Get validation error message for a specific field.
 *
 * @param error - The validation error
 * @param fieldName - The field name to find
 * @returns The error message for the field or null
 *
 * @example
 * ```ts
 * const emailError = getFieldError(err, 'email');
 * if (emailError) {
 *   setFieldError('email', emailError);
 * }
 * ```
 */
export function getFieldError(error: unknown, fieldName: string): string | null {
  const fields = getValidationErrors(error);
  const field = fields.find(
    (f) => f.loc.includes(fieldName) || f.loc[f.loc.length - 1] === fieldName
  );
  return field?.msg ?? null;
}

/**
 * Check if error is a specific HTTP status code.
 *
 * @param error - The error to check
 * @param statusCode - The HTTP status code to match
 * @returns True if the error matches the status code
 */
export function isHttpError(error: unknown, statusCode: number): boolean {
  const axiosError = error as AxiosError;
  return axiosError.response?.status === statusCode;
}

/**
 * Check if error is a network error (no response from server).
 */
export function isNetworkError(error: unknown): boolean {
  const axiosError = error as AxiosError;
  return axiosError.isAxiosError === true && !axiosError.response;
}

/**
 * Get HTTP status code from error, if available.
 */
export function getErrorStatusCode(error: unknown): number | null {
  const axiosError = error as AxiosError;
  return axiosError.response?.status ?? null;
}

/**
 * Check if error is an authentication error (401).
 */
export function isUnauthorizedError(error: unknown): boolean {
  return isHttpError(error, 401) || isErrorCode(error, ErrorCodes.UNAUTHORIZED);
}

/**
 * Check if error is a validation error (422).
 */
export function isValidationError(error: unknown): boolean {
  return isHttpError(error, 422) || isErrorCode(error, ErrorCodes.VALIDATION_ERROR);
}

/**
 * Check if error is a not found error (404).
 */
export function isNotFoundError(error: unknown): boolean {
  return (
    isHttpError(error, 404) ||
    isErrorCode(error, ErrorCodes.NOT_FOUND) ||
    isErrorCode(error, ErrorCodes.RESOURCE_NOT_FOUND)
  );
}

/**
 * Check if error is a conflict error (409).
 */
export function isConflictError(error: unknown): boolean {
  return (
    isHttpError(error, 409) ||
    isErrorCode(error, ErrorCodes.CONFLICT) ||
    isErrorCode(error, ErrorCodes.ALREADY_EXISTS)
  );
}

// Re-export ErrorCodes for convenience
export { ErrorCodes };
