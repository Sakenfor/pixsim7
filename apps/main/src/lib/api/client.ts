/**
 * API Client - Browser-specific wrapper for @pixsim7/shared.api.client
 *
 * This module provides a pre-configured API client instance for the web app.
 * It uses the environment-neutral @pixsim7/shared.api.client package with browser-specific
 * token storage and redirect handling.
 */
import { createApiClient, type PixSimApiClient } from '@pixsim7/shared.api.client';
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
 * API requests from feature panels should not clear auth storage or force a
 * global redirect on every 401. Some endpoints can return 401 transiently
 * (for example during local dev restarts) and must not invalidate the session.
 */
const sharedTokenProvider = getAuthTokenProvider();
const featureTokenProvider = {
  getAccessToken: () => sharedTokenProvider.getAccessToken(),
  setAccessToken: sharedTokenProvider.setAccessToken,
};

/**
 * Pre-configured API client instance for the web app.
 *
 * Features:
 * - Automatic token injection from auth storage (localStorage by default)
 * - Non-destructive 401 handling for regular feature requests
 */
const client = createApiClient({
  baseUrl: BACKEND_BASE,
  tokenProvider: featureTokenProvider,
});

function _normalizeRequestPath(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('/')) return url;
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function _headerValue(
  headers: unknown,
  name: string,
): string | null {
  if (!headers || typeof headers !== 'object') {
    return null;
  }

  const maybeGet = (headers as { get?: (key: string) => unknown }).get;
  if (typeof maybeGet === 'function') {
    const value = maybeGet.call(headers, name);
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== target) continue;
    if (typeof value === 'string') return value;
  }
  return null;
}

function _shortTokenPreview(token: string | null | undefined): string | null {
  if (!token) return null;
  if (token.length <= 18) return token;
  return `${token.slice(0, 12)}…${token.slice(-6)}`;
}

function _isTrackedAuthPath(pathname: string): boolean {
  return (
    pathname.startsWith('/game/worlds') ||
    pathname.startsWith('/game/locations') ||
    pathname.startsWith('/notifications') ||
    pathname.startsWith('/providers') ||
    pathname.startsWith('/accounts')
  );
}

function _detailToSingleLine(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const _authDebug401LastLogAtByKey = new Map<string, number>();
const _AUTH_DEBUG_401_COOLDOWN_MS = 1200;

if (import.meta.env.DEV) {
  const rawClient = client.getRawClient();
  rawClient.interceptors.response.use(
    (response) => response,
    async (error: any) => {
      try {
        const status = Number(error?.response?.status ?? 0);
        const requestPath = _normalizeRequestPath(error?.config?.url);
        if (status === 401 && _isTrackedAuthPath(requestPath)) {
          const method = String(error?.config?.method ?? 'get').toUpperCase();
          const key = `${method}:${requestPath}`;
          const now = Date.now();
          const lastAt = _authDebug401LastLogAtByKey.get(key) ?? 0;
          if (now - lastAt >= _AUTH_DEBUG_401_COOLDOWN_MS) {
            _authDebug401LastLogAtByKey.set(key, now);

            const sentAuthHeader = _headerValue(error?.config?.headers, 'Authorization');
            const requestId = _headerValue(error?.config?.headers, 'X-Request-ID');
            const traceId = _headerValue(error?.config?.headers, 'X-Trace-ID');
            const responseDetail =
              error?.response?.data?.detail ??
              error?.response?.data?.error ??
              error?.message ??
              null;
            const responseUrl =
              typeof error?.request?.responseURL === 'string' ? error.request.responseURL : null;
            const storedToken = await Promise.resolve(sharedTokenProvider.getAccessToken()).catch(
              () => null,
            );

            let authSnapshot: Record<string, unknown> | null = null;
            let worldSnapshot: Record<string, unknown> | null = null;
            let projectSnapshot: Record<string, unknown> | null = null;
            try {
              const [{ useAuthStore }, { useWorldContextStore }, { useProjectSessionStore }] =
                await Promise.all([
                  import('../../stores/authStore'),
                  import('../../features/scene/stores/worldContextStore'),
                  import('../../features/scene/stores/projectSessionStore'),
                ]);
              const auth = useAuthStore.getState();
              const world = useWorldContextStore.getState();
              const project = useProjectSessionStore.getState();
              authSnapshot = {
                isAuthenticated: auth.isAuthenticated,
                isLoading: auth.isLoading,
                userId: auth.user?.id ?? null,
                username: auth.user?.username ?? null,
              };
              worldSnapshot = {
                worldId: world.worldId,
                locationId: world.locationId,
              };
              projectSnapshot = {
                currentProjectId: project.currentProjectId,
                currentProjectSourceWorldId: project.currentProjectSourceWorldId,
                lastOperation: project.lastOperation,
              };
            } catch {
              // Debug-only path; ignore snapshot read failures.
            }

            console.warn('[api:401-debug]', {
              method,
              requestPath,
              pagePath: typeof window !== 'undefined' ? window.location.pathname : null,
              hasSentAuthorization: !!sentAuthHeader,
              sentAuthorizationPreview: sentAuthHeader
                ? _shortTokenPreview(sentAuthHeader.replace(/^Bearer\s+/i, ''))
                : null,
              storedTokenPreview: _shortTokenPreview(storedToken),
              requestId,
              traceId,
              responseDetail,
              responseUrl,
              authSnapshot,
              worldSnapshot,
              projectSnapshot,
            });
            console.warn(
              `[api:401-summary] ${method} ${requestPath} ` +
                `detail="${_detailToSingleLine(responseDetail)}" ` +
                `finalUrl="${responseUrl ?? 'n/a'}" ` +
                `sentAuth=${!!sentAuthHeader} storedToken=${!!storedToken} ` +
                `user=${authSnapshot?.userId ?? 'n/a'} ` +
                `world=${worldSnapshot?.worldId ?? 'n/a'} ` +
                `project=${projectSnapshot?.currentProjectId ?? 'n/a'} ` +
                `projectSourceWorld=${projectSnapshot?.currentProjectSourceWorldId ?? 'n/a'}`,
            );
          }
        }
      } catch {
        // Never break request flow from debug instrumentation.
      }
      return Promise.reject(error);
    },
  );
}

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
