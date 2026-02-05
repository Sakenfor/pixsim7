/**
 * Layout Persistence Utilities (Framework-Agnostic)
 *
 * Helpers for saving and loading dockview layouts to/from storage.
 */

import type { DockviewApi, SerializedDockview } from 'dockview-core';

export interface LayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Save a dockview layout to storage
 */
export function saveLayout(
  api: DockviewApi,
  storageKey: string,
  storage: LayoutStorage = localStorage,
): boolean {
  try {
    const layout = api.toJSON();
    storage.setItem(storageKey, JSON.stringify(layout));
    return true;
  } catch (e) {
    console.warn(`[dockview] Failed to save layout to ${storageKey}:`, e);
    return false;
  }
}

/**
 * Load a dockview layout from storage
 *
 * @returns true if layout was loaded successfully
 */
export function loadLayout(
  api: DockviewApi,
  storageKey: string,
  storage: LayoutStorage = localStorage,
): boolean {
  try {
    const stored = storage.getItem(storageKey);
    if (!stored) return false;

    const layout = JSON.parse(stored) as SerializedDockview;
    api.fromJSON(layout);
    return true;
  } catch (e) {
    console.warn(`[dockview] Failed to load layout from ${storageKey}:`, e);
    return false;
  }
}

/**
 * Clear a saved layout from storage
 */
export function clearLayout(
  storageKey: string,
  storage: LayoutStorage = localStorage,
): void {
  storage.removeItem(storageKey);
}

/**
 * Check if a saved layout exists
 */
export function hasLayout(
  storageKey: string,
  storage: LayoutStorage = localStorage,
): boolean {
  return storage.getItem(storageKey) !== null;
}

/**
 * Create a debounced layout save function
 *
 * Useful for connecting to onDidLayoutChange events
 */
export function createDebouncedSave(
  api: DockviewApi,
  storageKey: string,
  delay = 500,
  storage: LayoutStorage = localStorage,
): () => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      saveLayout(api, storageKey, storage);
      timeout = null;
    }, delay);
  };
}

/**
 * Setup auto-save on layout changes
 *
 * @returns Cleanup function to disconnect the listener
 */
export function setupAutoSave(
  api: DockviewApi,
  storageKey: string,
  options: {
    debounceMs?: number;
    storage?: LayoutStorage;
    /** Skip saving during this flag (e.g., while loading) */
    isLoading?: () => boolean;
  } = {},
): () => void {
  const { debounceMs = 500, storage = localStorage, isLoading } = options;
  const debouncedSave = createDebouncedSave(api, storageKey, debounceMs, storage);

  const disposable = api.onDidLayoutChange(() => {
    if (isLoading?.()) return;
    debouncedSave();
  });

  return () => disposable.dispose();
}
