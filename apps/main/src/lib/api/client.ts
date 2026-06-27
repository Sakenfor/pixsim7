/**
 * API Client - Browser-specific wrapper for @pixsim7/shared.api.client
 *
 * This module provides a pre-configured API client instance for the web app.
 * It uses the environment-neutral @pixsim7/shared.api.client package with browser-specific
 * token storage and redirect handling.
 */
import { createApiClient } from '@pixsim7/shared.api.client';
import {
  computeBackendUrl,
} from '@pixsim7/shared.api.client/browser';
import { getAuthTokenProvider } from '@pixsim7/shared.auth.core';

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
 * Keep auth UI state in sync when the API client clears tokens on 401.
 * This avoids "authenticated UI + no token" states where protected pages stay
 * mounted and every request fails until manual refresh.
 */
async function markUnauthorizedInStore(): Promise<void> {
  try {
    const { useAuthStore } = await import('@/stores/authStore');
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  } catch {
    // Best-effort only; redirect still handles the fallback.
  }
}

/**
 * Pre-configured API client instance for the web app.
 *
 * Features:
 * - Automatic token injection from auth storage (localStorage by default)
 * - Centralized 401 handling with redirect to /login
 * - Redirect storm prevention (only one redirect per page load)
 */
const client = createApiClient({
  baseUrl: BACKEND_BASE,
  tokenProvider: getAuthTokenProvider(),
  // Bound concurrent GETs so a generation burst (per-asset thumbnail polls +
  // WS asset refreshes) can't stampede the backend while it's busy with
  // ffmpeg/derivatives. Generous enough not to throttle normal page loads.
  // Dedup stays opt-in per-call (`{ dedup: true }`) to avoid stale
  // read-after-write; not flipped on globally.
  maxConcurrentGets: 8,
  onUnauthorized: () => {
    void markUnauthorizedInStore();

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
