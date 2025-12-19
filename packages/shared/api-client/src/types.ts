/**
 * API Client Types
 *
 * Environment-neutral type definitions for the API client.
 */

/**
 * Token provider interface for managing authentication tokens.
 *
 * Implementations must be provided by the consuming application
 * based on their environment (browser localStorage, secure storage, etc.).
 *
 * @example Browser implementation
 * ```ts
 * const browserTokenProvider: TokenProvider = {
 *   getAccessToken: async () => localStorage.getItem('access_token'),
 *   setAccessToken: async (token) => {
 *     if (token) localStorage.setItem('access_token', token);
 *     else localStorage.removeItem('access_token');
 *   },
 *   clearTokens: async () => {
 *     localStorage.removeItem('access_token');
 *     localStorage.removeItem('user');
 *   }
 * };
 * ```
 *
 * @example Electron/Tauri implementation
 * ```ts
 * const desktopTokenProvider: TokenProvider = {
 *   getAccessToken: async () => await secureStorage.get('access_token'),
 *   setAccessToken: async (token) => await secureStorage.set('access_token', token),
 *   clearTokens: async () => await secureStorage.clear()
 * };
 * ```
 */
export interface TokenProvider {
  /**
   * Get the current access token.
   * @returns The access token or null if not authenticated.
   */
  getAccessToken(): Promise<string | null> | string | null;

  /**
   * Set the access token (after login/refresh).
   * @param token The new access token, or null to clear.
   */
  setAccessToken?(token: string | null): Promise<void> | void;

  /**
   * Clear all authentication tokens (logout).
   */
  clearTokens?(): Promise<void> | void;
}

/**
 * API client configuration options.
 */
export interface ApiClientConfig {
  /**
   * Base URL for the API (e.g., 'http://localhost:8001').
   * Should NOT include the /api/v1 suffix.
   */
  baseUrl: string;

  /**
   * Token provider for authentication.
   * If not provided, requests will be made without authentication.
   */
  tokenProvider?: TokenProvider;

  /**
   * API version path (default: '/api/v1').
   */
  apiPath?: string;

  /**
   * Request timeout in milliseconds (default: 30000).
   */
  timeout?: number;

  /**
   * Callback for handling 401 responses (e.g., redirect to login).
   * If not provided, 401 errors are just thrown.
   */
  onUnauthorized?: () => void;
}

/**
 * Standardized error response from the API.
 *
 * All API errors follow this format for consistent error handling.
 */
export interface ErrorResponse {
  /**
   * Machine-readable error code (e.g., 'validation_error', 'not_found').
   */
  code: string;

  /**
   * Human-readable error message.
   */
  message: string;

  /**
   * Additional details about the error.
   */
  detail?: string | null;

  /**
   * Field-level validation errors (only for validation_error code).
   */
  fields?: Array<{
    loc: (string | number)[];
    msg: string;
    type: string;
  }> | null;

  /**
   * Request ID for debugging and support.
   */
  request_id?: string | null;
}

/**
 * API version information.
 */
export interface VersionInfo {
  /**
   * API version string (e.g., 'v1', '0.1.0').
   */
  api_version: string;

  /**
   * Git commit SHA of the build (null if not available).
   */
  build_sha: string | null;

  /**
   * ISO 8601 timestamp when the build was created.
   */
  build_time: string | null;

  /**
   * Current server time in ISO 8601 format.
   */
  server_time: string;
}

/**
 * Common error codes returned by the API.
 */
export const ErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_INVALID: 'token_invalid',

  // Resource errors
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  ALREADY_EXISTS: 'already_exists',
  RESOURCE_NOT_FOUND: 'resource_not_found',

  // Validation
  VALIDATION_ERROR: 'validation_error',
  INVALID_REQUEST: 'invalid_request',

  // Server errors
  INTERNAL_ERROR: 'internal_error',
  SERVICE_UNAVAILABLE: 'service_unavailable',

  // Provider errors
  PROVIDER_ERROR: 'provider_error',
  PROVIDER_QUOTA_EXCEEDED: 'provider_quota_exceeded',
  PROVIDER_RATE_LIMIT: 'provider_rate_limit',
  PROVIDER_CONTENT_FILTERED: 'provider_content_filtered',

  // Account/quota errors
  ACCOUNT_EXHAUSTED: 'account_exhausted',
  QUOTA_EXCEEDED: 'quota_exceeded',

  // Job errors
  JOB_CANCELLED: 'job_cancelled',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
