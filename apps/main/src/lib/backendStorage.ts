import type { StateStorage } from 'zustand/middleware';
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
      console.log(`[BackendStorage:${preferenceKey}] getItem called for ${name}`);

      try {
        // First, try localStorage for immediate hydration (faster)
        const localValue = localStorage.getItem(localStorageKey);
        console.log(`[BackendStorage:${preferenceKey}] LocalStorage value:`, localValue ? 'found' : 'empty');

        // For faster initial hydration, return localStorage value immediately
        // Skip backend check for now (can sync in background later)
        if (localValue) {
          console.log(`[BackendStorage:${preferenceKey}] Returning localStorage value immediately`);
          console.log(`[BackendStorage:${preferenceKey}] Value type:`, typeof localValue, 'Length:', localValue.length);
          console.log(`[BackendStorage:${preferenceKey}] Value preview:`, localValue.substring(0, 100) + '...');
          return localValue;
        }

        // If no localStorage value, try backend as fallback
        console.log(`[BackendStorage:${preferenceKey}] No localStorage, trying backend...`);
        try {
          const prefs = await getUserPreferences();
          const backendValue = prefs[preferenceKey];

          if (backendValue) {
            const serialized = JSON.stringify(backendValue);
            console.log(`[BackendStorage:${preferenceKey}] Got value from backend, saving to localStorage`);
            localStorage.setItem(localStorageKey, serialized);
            return serialized;
          }
        } catch (error) {
          console.warn(`[BackendStorage:${preferenceKey}] Backend fetch failed:`, error);
        }

        console.log(`[BackendStorage:${preferenceKey}] No value found anywhere, returning null`);
        return null;
      } catch (error) {
        console.error(`[BackendStorage:${preferenceKey}] getItem error:`, error);
        return null;
      }
    },

    setItem: async (name: string, value: string | any): Promise<void> => {
      console.log(`[BackendStorage:${preferenceKey}] setItem called for ${name}, value type:`, typeof value);

      // Zustand persist may pass either a string or object depending on configuration
      // We need to handle both cases and ensure we store a string
      let stringValue: string;

      if (typeof value === 'string') {
        stringValue = value;
      } else if (typeof value === 'object') {
        // Zustand is passing the object directly, we need to stringify it
        console.log(`[BackendStorage:${preferenceKey}] Stringifying object for storage`);
        try {
          stringValue = JSON.stringify(value);
        } catch (e) {
          console.error(`[BackendStorage:${preferenceKey}] Failed to stringify value:`, e);
          return; // Don't save corrupted data
        }
      } else {
        console.error(`[BackendStorage:${preferenceKey}] Unexpected value type:`, typeof value);
        return;
      }

      // Always save to localStorage immediately (for offline access and fast reads)
      localStorage.setItem(localStorageKey, stringValue);

      // Debounce backend sync to avoid excessive API calls
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }

      saveTimeout = setTimeout(async () => {
        console.log(`[BackendStorage:${preferenceKey}] Syncing to backend after debounce`);
        try {
          // Parse the stringValue to get the object for backend storage
          let parsed: unknown;
          try {
            parsed = JSON.parse(stringValue);
          } catch {
            // Fallback: if already an object, use it directly
            parsed = stringValue;
          }
          await updatePreferenceKey(preferenceKey as any, parsed as any);
          console.log(`[BackendStorage:${preferenceKey}] Successfully synced to backend`);
        } catch (error) {
          console.error(`[BackendStorage:${preferenceKey}] Failed to sync to backend:`, error);
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
