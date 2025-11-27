/**
 * Zustand Persist Workaround for v5 async storage bug
 *
 * Issue: Zustand v5's persist middleware doesn't call onRehydrateStorage callback
 * with custom async storage adapters.
 *
 * This utility manually rehydrates state from localStorage as a workaround.
 *
 * Usage:
 *   import { manuallyRehydrateStore } from './lib/zustandPersistWorkaround';
 *
 *   // After creating your store with persist()
 *   if (typeof window !== 'undefined') {
 *     setTimeout(() => {
 *       manuallyRehydrateStore(useMyStore, 'myStorageKey_local');
 *     }, 50);
 *   }
 */

import { debugFlags } from './debugFlags';

export function manuallyRehydrateStore<T>(
  store: {
    getState: () => T;
    setState: (partial: Partial<T>) => void;
  },
  localStorageKey: string,
  storeName: string = 'Store'
): void {
  const storedValue = localStorage.getItem(localStorageKey);

  if (!storedValue) {
    debugFlags.log('rehydration', `[${storeName}] No persisted state found`);
    return;
  }

  debugFlags.log('rehydration', `[${storeName}] ⚠️ MANUAL REHYDRATION: Found persisted state, applying...`);

  try {
    const parsed = JSON.parse(storedValue);

    if (parsed.state && parsed.version !== undefined) {
      const savedState = parsed.state;
      debugFlags.log('rehydration', `[${storeName}] Rehydrating ${Object.keys(savedState).length} fields`);

      // Dynamically merge all state fields (excluding functions)
      const stateToMerge: Partial<T> = {};
      for (const [key, value] of Object.entries(savedState)) {
        if (typeof value !== 'function') {
          (stateToMerge as any)[key] = value;
        }
      }

      debugFlags.log('rehydration', `[${storeName}] Merging fields:`, Object.keys(stateToMerge).join(', '));

      // Apply the state
      store.setState(stateToMerge);

      debugFlags.log('rehydration', `[${storeName}] ✅ MANUAL REHYDRATION COMPLETE!`);
    } else {
      debugFlags.warn('rehydration', `[${storeName}] Invalid persist format:`, parsed);
    }
  } catch (error) {
    debugFlags.error('rehydration', `[${storeName}] Manual rehydration failed:`, error);
  }
}

/**
 * Helper to expose store to window for debugging
 */
export function exposeStoreForDebugging<T>(
  store: { getState: () => T; setState: (partial: Partial<T>) => void },
  name: string
): void {
  if (typeof window !== 'undefined') {
    (window as any)[`__${name}Store`] = store;
    debugFlags.log('stores', `💡 ${name} store exposed! Run: window.__${name}Store.getState()`);
  }
}
