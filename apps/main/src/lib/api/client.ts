/**
 * API Client - Browser-specific wrapper for @pixsim7/api-client
 *
 * This module provides a pre-configured API client instance for the web app.
 * It uses the environment-neutral @pixsim7/api-client package with browser-specific
 * token storage and redirect handling.
 */
import { createApiClient, type PixSimApiClient } from '@pixsim7/api-client';
import {
  createBrowserTokenProvider,
  computeBackendUrl,
} from '@pixsim7/api-client/browser';

/**
 * Backend base URL (without /api/v1 suffix).
 * Uses VITE_BACKEND_URL env var, or infers from window.location, or falls back to localhost.
 */
export const BACKEND_BASE = computeBackendUrl({
  envUrl: import.meta.env.VITE_BACKEND_URL as string | undefined,
  defaultPort: 8000,
  fallbackUrl: 'http://localhost:8000',
});

/**
 * Full API base URL (with /api/v1 suffix).
 */
export const API_BASE_URL = `${BACKEND_BASE}/api/v1`;

/**
 * Static flag to prevent multiple redirects to /login.
 * Once set to true, remains true for the lifetime of the page.
 * This ensures parallel 401 responses only trigger one redirect.
 */
let isRedirecting = false;

/**
 * Browser token provider using localStorage.
 */
const browserTokenProvider = createBrowserTokenProvider({
  tokenKey: 'access_token',
  userKey: 'user',
});

/**
 * Pre-configured API client instance for the web app.
 *
 * Features:
 * - Automatic token injection from localStorage
 * - Centralized 401 handling with redirect to /login
 * - Redirect storm prevention (only one redirect per page load)
 */
const client = createApiClient({
  baseUrl: BACKEND_BASE,
  tokenProvider: browserTokenProvider,
  onUnauthorized: () => {
    // Token expired or invalid - redirect once (prevent flash loops from parallel requests)
    if (typeof window !== 'undefined') {
      if (!window.location.pathname.startsWith('/login') && !isRedirecting) {
        isRedirecting = true;
        window.location.href = '/login';
      }
    }
  },
});

/**
 * Legacy API client wrapper for backward compatibility.
 *
 * Provides the same interface as the old ApiClient class.
 * New code should import from @pixsim7/api-client directly.
 *
 * @deprecated Prefer `pixsimClient` (returns data directly) or `pixsimClient.getRawClient()` if you need AxiosResponse.
 */
class ApiClientWrapper {
  private client: PixSimApiClient;

  constructor(pixSimClient: PixSimApiClient) {
    this.client = pixSimClient;
  }

  get<T>(url: string, config?: Parameters<PixSimApiClient['get']>[1]) {
    // Return AxiosResponse shape for backward compatibility
    return this.client.getRawClient().get<T>(url, config);
  }

  post<T>(url: string, data?: unknown, config?: Parameters<PixSimApiClient['post']>[2]) {
    return this.client.getRawClient().post<T>(url, data, config);
  }

  put<T>(url: string, data?: unknown, config?: Parameters<PixSimApiClient['put']>[2]) {
    return this.client.getRawClient().put<T>(url, data, config);
  }

  patch<T>(url: string, data?: unknown, config?: Parameters<PixSimApiClient['patch']>[2]) {
    return this.client.getRawClient().patch<T>(url, data, config);
  }

  delete<T>(url: string, config?: Parameters<PixSimApiClient['delete']>[1]) {
    return this.client.getRawClient().delete<T>(url, config);
  }

  getRawClient() {
    return this.client.getRawClient();
  }
}

/**
 * Singleton API client instance.
 *
 * @example
 * ```ts
 * import { apiClient } from '@lib/api';
 *
 * const response = await apiClient.get('/assets');
 * const assets = response.data;
 * ```
 *
 * @deprecated Prefer `pixsimClient` (data-returning) or domain helpers in `@pixsim7/api-client/domains`.
 */
export const apiClient = new ApiClientWrapper(client);

/**
 * Direct access to the new PixSimApiClient.
 * Prefer this for new code.
 *
 * @example
 * ```ts
 * import { pixsimClient } from '@lib/api';
 *
 * const assets = await pixsimClient.get<Asset[]>('/assets');
 * ```
 */
export const pixsimClient = client;
