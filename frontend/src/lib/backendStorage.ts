import { StateStorage } from 'zustand/middleware';
import { getUserPreferences, updatePreferenceKey } from './api/userPreferences';

/**
 * Backend-synced storage for Zustand persist middleware
 *
 * This storage implementation:
 * 1. Uses localStorage for immediate access (offline support)
 * 2. Syncs with backend on load (hydration)
 * 3. Debounces backend updates on save to avoid excessive API calls
 *
 * Usage:
 *   persist(stateCreator, {
 *     name: 'my-store',
 *     storage: createBackendStorage('myPreferenceKey'),
 *   })
 */
export function createBackendStorage(preferenceKey: string): StateStorage {
  const localStorageKey = `${preferenceKey}_local`;
  let saveTimeout: NodeJS.Timeout | null = null;
  const SAVE_DEBOUNCE_MS = 2000; // Wait 2s after last change before syncing to backend

  return {
    getItem: async (name: string): Promise<string | null> => {
      try {
        // First, try to get from backend (authoritative source)
        const prefs = await getUserPreferences();
        const backendValue = prefs[preferenceKey];

        if (backendValue) {
          // Store in localStorage for offline access
          const serialized = JSON.stringify(backendValue);
          localStorage.setItem(localStorageKey, serialized);
          return serialized;
        }
      } catch (error) {
        console.warn(`[BackendStorage] Failed to load from backend for ${preferenceKey}:`, error);
        // Fall through to localStorage
      }

      // Fallback to localStorage if backend fails or returns nothing
      return localStorage.getItem(localStorageKey);
    },

    setItem: async (name: string, value: string): Promise<void> => {
      // Always save to localStorage immediately (for offline access and fast reads)
      localStorage.setItem(localStorageKey, value);

      // Debounce backend sync to avoid excessive API calls
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }

      saveTimeout = setTimeout(async () => {
        try {
          const parsed = JSON.parse(value);
          await updatePreferenceKey(preferenceKey, parsed);
        } catch (error) {
          console.error(`[BackendStorage] Failed to sync to backend for ${preferenceKey}:`, error);
          // Don't throw - localStorage save already succeeded
        }
      }, SAVE_DEBOUNCE_MS);
    },

    removeItem: async (name: string): Promise<void> => {
      // Remove from localStorage
      localStorage.removeItem(localStorageKey);

      // Clear from backend
      try {
        await updatePreferenceKey(preferenceKey, null as any);
      } catch (error) {
        console.error(`[BackendStorage] Failed to remove from backend for ${preferenceKey}:`, error);
      }
    },
  };
}
