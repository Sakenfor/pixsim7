/**
 * Multi-Server API Client
 *
 * Provides API client functionality that's aware of the active server.
 * For new multi-server aware code, use this instead of the static apiClient.
 *
 * Integration notes:
 * - For full integration, authService would need to store tokens per-server
 * - Login/logout would need to be server-specific
 * - The app would need to reload data when switching servers
 *
 * Current approach:
 * - getActiveServerClient() returns a fetch-based client for the active server
 * - Tokens are stored per-server in localStorage (access_token_{serverId})
 * - Switching servers triggers a page reload to refresh all data
 */

import { useServerManagerStore } from '@/stores/serverManagerStore';
import { authService } from '@lib/auth/authService';

// =============================================================================
// Types
// =============================================================================

export interface ApiResponse<T> {
  data: T;
  status: number;
  ok: boolean;
}

export interface ApiError {
  message: string;
  status: number;
  details?: unknown;
}

// =============================================================================
// Multi-Server Client
// =============================================================================

/**
 * Create an API client for a specific server
 */
export function createServerClient(baseUrl: string, token: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const url = `${baseUrl}/api/v1${path}`;

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const error: ApiError = {
        message: data?.detail || data?.message || 'Request failed',
        status: response.status,
        details: data,
      };
      throw error;
    }

    return {
      data: data as T,
      status: response.status,
      ok: response.ok,
    };
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  };
}

/**
 * Get an API client for the active server
 *
 * @returns API client configured for the active server, or null if no server is active
 */
export function getActiveServerClient() {
  const store = useServerManagerStore.getState();
  const activeServer = store.getActiveServer();

  if (!activeServer) {
    return null;
  }

  const token = store.getServerToken(activeServer.id);
  return createServerClient(activeServer.url, token);
}

/**
 * Hook to get an API client for the active server (reactive)
 */
export function useActiveServerClient() {
  const activeServer = useServerManagerStore((state) => state.getActiveServer());
  const getServerToken = useServerManagerStore((state) => state.getServerToken);

  if (!activeServer) {
    return null;
  }

  const token = getServerToken(activeServer.id);
  return createServerClient(activeServer.url, token);
}

// =============================================================================
// Migration Helpers
// =============================================================================

/**
 * Initialize server manager with the current/default server.
 *
 * Call this on app startup to auto-add the current backend as a server.
 * This provides a smooth migration path for existing single-server usage.
 */
export async function initializeDefaultServer() {
  const store = useServerManagerStore.getState();

  // Skip if servers already configured
  if (store.servers.length > 0) {
    return;
  }

  // Get current backend URL from env or default
  const backendUrl =
    (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:8000';

  try {
    // Try to add the current backend as default server
    await store.addServer(backendUrl);
    console.log('[multiServerClient] Initialized default server:', backendUrl);
  } catch (error) {
    console.warn('[multiServerClient] Could not initialize default server:', error);
  }
}

/**
 * Migrate existing auth tokens to multi-server format.
 *
 * Checks for legacy 'access_token' and 'user' in localStorage,
 * and associates them with the active server.
 */
export function migrateExistingAuth() {
  const store = useServerManagerStore.getState();
  const activeServerId = store.activeServerId;

  if (!activeServerId) {
    return;
  }

  // Check for legacy token (use authService for abstracted access)
  const legacyToken = authService.getStoredToken();
  const legacyUser = authService.getStoredUser();

  if (legacyToken) {
    // Migrate to server-specific token
    store.setServerToken(activeServerId, legacyToken);
    console.log('[multiServerClient] Migrated token to server:', activeServerId);
  }

  if (legacyUser) {
    store.updateServerAccount(activeServerId, {
      serverId: activeServerId,
      userId: legacyUser.id,
      username: legacyUser.username,
      email: legacyUser.email,
    });
    console.log('[multiServerClient] Migrated user to server:', activeServerId);
  }
}
