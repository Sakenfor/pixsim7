/**
 * Server Manager Store
 *
 * Manages connections to multiple PixSim7 server instances.
 * Stores server metadata and authentication tokens per-server.
 *
 * Storage is abstracted via StorageAdapter interface for cross-platform support:
 * - Browser: localStorage (default)
 * - Desktop (Electron/Tauri): Can provide secure storage adapter
 *
 * Usage:
 * ```ts
 * // Browser (default)
 * import { useServerManagerStore } from './serverManagerStore';
 *
 * // Desktop with custom storage
 * import { setStorageAdapter } from './serverManagerStore';
 * setStorageAdapter(mySecureStorageAdapter);
 * ```
 */
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

// =============================================================================
// Storage Adapter (for cross-platform support)
// =============================================================================

/**
 * Storage adapter interface for cross-platform token/data storage.
 *
 * Default: localStorage (browser)
 * Desktop apps can provide secure storage (OS keychain, encrypted file, etc.)
 */
export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/**
 * Default browser storage adapter using localStorage
 */
const browserStorageAdapter: StorageAdapter = {
  getItem: (key) => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(key);
  },
};

/**
 * Current storage adapter (can be swapped for desktop)
 */
let storageAdapter: StorageAdapter = browserStorageAdapter;

/**
 * Set a custom storage adapter (for desktop apps)
 * Call this before using the store.
 */
export function setStorageAdapter(adapter: StorageAdapter): void {
  storageAdapter = adapter;
}

/**
 * Get the current storage adapter
 */
export function getStorageAdapter(): StorageAdapter {
  return storageAdapter;
}

// =============================================================================
// Types
// =============================================================================

export interface ServerConfig {
  /** Unique identifier from server (e.g., 'official', 'local', 'friend-alice') */
  id: string;
  /** Server URL (e.g., 'https://pixsim.io', 'http://localhost:8000') */
  url: string;
  /** Human-readable name */
  name: string;
  /** Optional description */
  description?: string;
  /** Server version */
  version?: string;
  /** When this server was added */
  addedAt: number;
  /** Last successful connection */
  lastConnectedAt?: number;
}

export interface ServerAccount {
  /** Server ID this account belongs to */
  serverId: string;
  /** User ID on this server */
  userId: number;
  /** Username on this server */
  username: string;
  /** Email on this server */
  email: string;
}

interface ServerManagerState {
  /** List of configured servers */
  servers: ServerConfig[];
  /** Currently active server ID */
  activeServerId: string | null;
  /** Accounts per server (serverId -> account info) */
  accounts: Record<string, ServerAccount>;
  /** Loading state for server operations */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;

  // Actions
  addServer: (url: string) => Promise<ServerConfig>;
  removeServer: (serverId: string) => void;
  setActiveServer: (serverId: string) => void;
  updateServerAccount: (serverId: string, account: ServerAccount) => void;
  clearServerAccount: (serverId: string) => void;
  getActiveServer: () => ServerConfig | null;
  getServerToken: (serverId: string) => string | null;
  setServerToken: (serverId: string, token: string) => void;
  clearServerToken: (serverId: string) => void;
  refreshServerInfo: (serverId: string) => Promise<void>;
}

// =============================================================================
// Server Info API
// =============================================================================

interface ServerInfoResponse {
  server_id: string;
  server_name: string;
  server_description: string;
  version: string;
  api_version: string;
}

async function fetchServerInfo(baseUrl: string): Promise<ServerInfoResponse> {
  const url = `${baseUrl}/api/v1/server/info`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch server info: ${response.status}`);
  }

  return response.json();
}

// =============================================================================
// Token Storage Helpers (use storage adapter)
// =============================================================================

function getTokenKey(serverId: string): string {
  return `access_token_${serverId}`;
}

function getUserKey(serverId: string): string {
  return `user_${serverId}`;
}

/**
 * Get token from storage (sync for now, async support via adapter)
 */
function getTokenFromStorage(serverId: string): string | null {
  const result = storageAdapter.getItem(getTokenKey(serverId));
  // Handle both sync and async - for now we assume sync in store methods
  if (result instanceof Promise) {
    console.warn('[serverManager] Async storage not fully supported in sync getServerToken');
    return null;
  }
  return result;
}

/**
 * Set token in storage
 */
function setTokenInStorage(serverId: string, token: string): void {
  storageAdapter.setItem(getTokenKey(serverId), token);
}

/**
 * Remove token from storage
 */
function removeTokenFromStorage(serverId: string): void {
  storageAdapter.removeItem(getTokenKey(serverId));
}

/**
 * Get user from storage
 */
function getUserFromStorage(serverId: string): ServerAccount | null {
  const result = storageAdapter.getItem(getUserKey(serverId));
  if (result instanceof Promise || !result) return null;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

/**
 * Set user in storage
 */
function setUserInStorage(serverId: string, account: ServerAccount): void {
  storageAdapter.setItem(getUserKey(serverId), JSON.stringify(account));
}

/**
 * Remove user from storage
 */
function removeUserFromStorage(serverId: string): void {
  storageAdapter.removeItem(getUserKey(serverId));
}

// =============================================================================
// Store
// =============================================================================

export const useServerManagerStore = create<ServerManagerState>()(
  persist(
    (set, get) => ({
      servers: [],
      activeServerId: null,
      accounts: {},
      isLoading: false,
      error: null,

      addServer: async (url: string) => {
        set({ isLoading: true, error: null });

        try {
          // Normalize URL (remove trailing slash)
          const normalizedUrl = url.replace(/\/+$/, '');

          // Fetch server info
          const info = await fetchServerInfo(normalizedUrl);

          // Check if server already exists
          const existing = get().servers.find((s) => s.id === info.server_id);
          if (existing) {
            // Update existing server
            set((state) => ({
              servers: state.servers.map((s) =>
                s.id === info.server_id
                  ? {
                      ...s,
                      url: normalizedUrl,
                      name: info.server_name,
                      description: info.server_description,
                      version: info.version,
                      lastConnectedAt: Date.now(),
                    }
                  : s
              ),
              isLoading: false,
            }));
            return existing;
          }

          // Add new server
          const newServer: ServerConfig = {
            id: info.server_id,
            url: normalizedUrl,
            name: info.server_name,
            description: info.server_description,
            version: info.version,
            addedAt: Date.now(),
            lastConnectedAt: Date.now(),
          };

          set((state) => ({
            servers: [...state.servers, newServer],
            // Auto-select if first server
            activeServerId: state.activeServerId ?? newServer.id,
            isLoading: false,
          }));

          return newServer;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to add server';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      removeServer: (serverId: string) => {
        // Clear tokens and user data for this server (via storage adapter)
        removeTokenFromStorage(serverId);
        removeUserFromStorage(serverId);

        set((state) => {
          const newServers = state.servers.filter((s) => s.id !== serverId);
          const newAccounts = { ...state.accounts };
          delete newAccounts[serverId];

          return {
            servers: newServers,
            accounts: newAccounts,
            // If removing active server, switch to first available
            activeServerId:
              state.activeServerId === serverId
                ? newServers[0]?.id ?? null
                : state.activeServerId,
          };
        });
      },

      setActiveServer: (serverId: string) => {
        const server = get().servers.find((s) => s.id === serverId);
        if (server) {
          set({ activeServerId: serverId });
        }
      },

      updateServerAccount: (serverId: string, account: ServerAccount) => {
        set((state) => ({
          accounts: { ...state.accounts, [serverId]: account },
        }));
        // Also store user via storage adapter
        setUserInStorage(serverId, account);
      },

      clearServerAccount: (serverId: string) => {
        removeUserFromStorage(serverId);
        set((state) => {
          const newAccounts = { ...state.accounts };
          delete newAccounts[serverId];
          return { accounts: newAccounts };
        });
      },

      getActiveServer: () => {
        const { servers, activeServerId } = get();
        return servers.find((s) => s.id === activeServerId) ?? null;
      },

      getServerToken: (serverId: string) => {
        return getTokenFromStorage(serverId);
      },

      setServerToken: (serverId: string, token: string) => {
        setTokenInStorage(serverId, token);
      },

      clearServerToken: (serverId: string) => {
        removeTokenFromStorage(serverId);
      },

      refreshServerInfo: async (serverId: string) => {
        const server = get().servers.find((s) => s.id === serverId);
        if (!server) return;

        try {
          const info = await fetchServerInfo(server.url);
          set((state) => ({
            servers: state.servers.map((s) =>
              s.id === serverId
                ? {
                    ...s,
                    name: info.server_name,
                    description: info.server_description,
                    version: info.version,
                    lastConnectedAt: Date.now(),
                  }
                : s
            ),
          }));
        } catch (error) {
          console.error(`Failed to refresh server info for ${serverId}:`, error);
        }
      },
    }),
    {
      name: 'pixsim-servers',
      partialize: (state) => ({
        servers: state.servers,
        activeServerId: state.activeServerId,
        // Don't persist accounts - they're loaded from storage adapter per-server
      }),
      // Use storage adapter for Zustand persist (cross-platform support)
      storage: createJSONStorage(() => storageAdapter as StateStorage),
    }
  )
);

// =============================================================================
// Helper Hooks
// =============================================================================

/**
 * Get the base URL for the active server
 */
export function useActiveServerUrl(): string | null {
  const activeServer = useServerManagerStore((state) => state.getActiveServer());
  return activeServer?.url ?? null;
}

/**
 * Get the auth token for the active server
 */
export function useActiveServerToken(): string | null {
  const store = useServerManagerStore();
  const activeServerId = store.activeServerId;
  if (!activeServerId) return null;
  return store.getServerToken(activeServerId);
}
