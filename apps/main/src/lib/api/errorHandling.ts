/**
 * API Error Handling Utilities
 *
 * Centralized error extraction and formatting for API responses.
 * Use these instead of inline error?.response?.data?.detail checks.
 */

import type { AxiosError } from 'axios';

/**
 * Extract error message from API error response
 *
 * Handles various error shapes:
 * - Axios errors with response.data.detail
 * - Error objects with message property
 * - Plain strings
 * - Unknown error types
 *
 * @param error - The error to extract message from
 * @param fallback - Default message if extraction fails
 * @returns User-friendly error message
 *
 * @example
 * ```ts
 * try {
 *   await api.call();
 * } catch (err) {
 *   const message = extractErrorMessage(err, 'Operation failed');
 *   setError(message);
 * }
 * ```
 */
export function extractErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  // Handle null/undefined
  if (!error) {
    return fallback;
  }

  // Try Axios error shape first (most common in our API calls)
  const axiosError = error as AxiosError<{ detail?: string | string[] }>;
  if (axiosError.response?.data?.detail) {
    const detail = axiosError.response.data.detail;
    // Handle array of errors (some endpoints return multiple)
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

  // Give up, return fallback
  return fallback;
}

/**
 * Check if error is a specific HTTP status code
 *
 * @example
 * ```ts
 * if (isHttpError(err, 401)) {
 *   // Handle unauthorized
 * } else if (isHttpError(err, 409)) {
 *   // Handle conflict
 * }
 * ```
 */
export function isHttpError(error: unknown, statusCode: number): boolean {
  const axiosError = error as AxiosError;
  return axiosError.response?.status === statusCode;
}

/**
 * Check if error is a network error (no response from server)
 */
export function isNetworkError(error: unknown): boolean {
  const axiosError = error as AxiosError;
  return axiosError.isAxiosError === true && !axiosError.response;
}

/**
 * Get HTTP status code from error, if available
 */
export function getErrorStatusCode(error: unknown): number | null {
  const axiosError = error as AxiosError;
  return axiosError.response?.status ?? null;
}
