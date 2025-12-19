/**
 * Browser Token Provider
 *
 * Token provider implementation using browser localStorage.
 * Only use this in browser environments.
 */
import type { TokenProvider } from '../types';

/**
 * Default localStorage key for the access token.
 */
export const DEFAULT_TOKEN_KEY = 'access_token';

/**
 * Default localStorage key for user data.
 */
export const DEFAULT_USER_KEY = 'user';

/**
 * Options for creating a browser token provider.
 */
export interface BrowserTokenProviderOptions {
  /**
   * localStorage key for the access token.
   * @default 'access_token'
   */
  tokenKey?: string;

  /**
   * localStorage key for user data (cleared on logout).
   * @default 'user'
   */
  userKey?: string;
}

/**
 * Create a token provider that uses browser localStorage.
 *
 * This should only be used in browser environments.
 * For desktop apps (Electron/Tauri), use secure storage instead.
 *
 * @param options - Configuration options
 * @returns TokenProvider implementation
 *
 * @example
 * ```ts
 * import { createApiClient } from '@pixsim7/api-client';
 * import { createBrowserTokenProvider } from '@pixsim7/api-client/browser';
 *
 * const client = createApiClient({
 *   baseUrl: 'http://localhost:8001',
 *   tokenProvider: createBrowserTokenProvider(),
 * });
 * ```
 */
export function createBrowserTokenProvider(
  options: BrowserTokenProviderOptions = {}
): TokenProvider {
  const tokenKey = options.tokenKey ?? DEFAULT_TOKEN_KEY;
  const userKey = options.userKey ?? DEFAULT_USER_KEY;

  return {
    getAccessToken(): string | null {
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }
      return localStorage.getItem(tokenKey);
    },

    setAccessToken(token: string | null): void {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      if (token) {
        localStorage.setItem(tokenKey, token);
      } else {
        localStorage.removeItem(tokenKey);
      }
    },

    clearTokens(): void {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(userKey);
    },
  };
}
