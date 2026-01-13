/**
 * @pixsim7/shared.api-client
 *
 * Environment-neutral API client for PixSim7.
 * Works in browser, Node.js, Electron, and Tauri.
 *
 * @example Basic usage
 * ```ts
 * import { createApiClient, type TokenProvider } from '@pixsim7/shared.api-client';
 *
 * // Create a token provider for your environment
 * const tokenProvider: TokenProvider = {
 *   getAccessToken: async () => myStorage.get('token'),
 *   clearTokens: async () => myStorage.clear(),
 * };
 *
 * // Create the client
 * const client = createApiClient({
 *   baseUrl: 'http://localhost:8001',
 *   tokenProvider,
 * });
 *
 * // Make requests
 * const assets = await client.get('/assets');
 * ```
 *
 * @example Browser usage
 * ```ts
 * import { createApiClient } from '@pixsim7/shared.api-client';
 * import { createBrowserTokenProvider } from '@pixsim7/shared.api-client/browser';
 *
 * const client = createApiClient({
 *   baseUrl: 'http://localhost:8001',
 *   tokenProvider: createBrowserTokenProvider(),
 *   onUnauthorized: () => window.location.href = '/login',
 * });
 * ```
 *
 * @packageDocumentation
 */

// Core client
export { PixSimApiClient, createApiClient } from './client';

// Types
export type {
  TokenProvider,
  ApiClientConfig,
  ErrorResponse,
  VersionInfo,
  ErrorCode,
} from './types';
export { ErrorCodes } from './types';

// Error handling utilities
export {
  extractErrorMessage,
  getErrorResponse,
  getErrorCode,
  isErrorCode,
  getValidationErrors,
  getFieldError,
  isHttpError,
  isNetworkError,
  getErrorStatusCode,
  isUnauthorizedError,
  isValidationError,
  isNotFoundError,
  isConflictError,
  isErrorResponse,
} from './errors';
