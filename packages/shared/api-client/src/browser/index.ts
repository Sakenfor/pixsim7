/**
 * @pixsim7/api-client/browser
 *
 * Browser-specific utilities for the API client.
 * Only import this in browser environments.
 *
 * @example
 * ```ts
 * import { createApiClient } from '@pixsim7/api-client';
 * import {
 *   createBrowserTokenProvider,
 *   computeBackendUrl,
 * } from '@pixsim7/api-client/browser';
 *
 * const client = createApiClient({
 *   baseUrl: computeBackendUrl({
 *     envUrl: import.meta.env.VITE_BACKEND_URL,
 *     defaultPort: 8001,
 *   }),
 *   tokenProvider: createBrowserTokenProvider(),
 *   onUnauthorized: () => {
 *     if (!window.location.pathname.startsWith('/login')) {
 *       window.location.href = '/login';
 *     }
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

// Token provider
export {
  createBrowserTokenProvider,
  DEFAULT_TOKEN_KEY,
  DEFAULT_USER_KEY,
  type BrowserTokenProviderOptions,
} from './tokenProvider';

// Configuration utilities
export {
  computeBackendUrl,
  computeWebSocketUrl,
  type ComputeBackendUrlOptions,
} from './config';
