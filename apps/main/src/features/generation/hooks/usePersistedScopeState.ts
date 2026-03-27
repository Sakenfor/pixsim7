import { useCallback, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';

import { useGenerationScopeStores } from './useGenerationScope';

// ---------------------------------------------------------------------------
// Stable (scope-independent) persistence via localStorage
// ---------------------------------------------------------------------------

const STABLE_LS_KEY = 'generation_ui_prefs';

/** Read the stable prefs bag from localStorage (or empty object). */
function readStableBag(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STABLE_LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Write a single key into the stable prefs bag. */
function writeStableKey(key: string, value: unknown): void {
  try {
    const bag = readStableBag();
    bag[key] = value;
    localStorage.setItem(STABLE_LS_KEY, JSON.stringify(bag));
  } catch { /* best effort */ }
}

// Tiny external-store plumbing so React re-renders on localStorage writes.
const stableListeners = new Set<() => void>();
function subscribeStable(cb: () => void) {
  stableListeners.add(cb);
  return () => { stableListeners.delete(cb); };
}
function notifyStable() {
  stableListeners.forEach((cb) => cb());
}

function useStablePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const value = useSyncExternalStore(
    subscribeStable,
    () => {
      const stored = readStableBag()[key];
      return stored !== undefined ? (stored as T) : defaultValue;
    },
    () => defaultValue,
  );

  const setter: Dispatch<SetStateAction<T>> = useCallback(
    (action) => {
      const prev = (() => {
        const stored = readStableBag()[key];
        return stored !== undefined ? (stored as T) : defaultValue;
      })();
      const next = typeof action === 'function'
        ? (action as (prev: T) => T)(prev)
        : action;
      writeStableKey(key, next);
      notifyStable();
    },
    [key, defaultValue],
  );

  return [value, setter];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface PersistedScopeStateOptions {
  /**
   * When true, the value is stored in a scope-independent localStorage key
   * that survives scope changes and store pruning.  Use for user-level
   * preferences (e.g. `perProviderInputs`) rather than scope-specific state.
   */
  stable?: boolean;
}

/**
 * Drop-in replacement for `useState` that persists values in the generation
 * session store's `uiState` bag.  Values survive page refreshes and scope
 * re-mounts because the session store is backed by localStorage.
 *
 * Ephemeral UI state (popup open/close, anchor positions) should still use
 * plain `useState`.
 *
 * @param key   Unique key inside `uiState` (e.g. `'burstCount'`)
 * @param defaultValue  Returned when the key is absent from the store
 * @param options  `{ stable: true }` persists outside the scoped store
 */
export function usePersistedScopeState<T>(
  key: string,
  defaultValue: T,
  options?: PersistedScopeStateOptions,
): [T, Dispatch<SetStateAction<T>>] {
  /* eslint-disable react-hooks/rules-of-hooks */
  // Branch is stable per call-site — key and options.stable never change at runtime.
  if (options?.stable) {
    return useStablePersistedState(key, defaultValue);
  }

  const { useSessionStore } = useGenerationScopeStores();

  const value = useSessionStore((s) => {
    const stored = s.uiState?.[key];
    return stored !== undefined ? (stored as T) : defaultValue;
  });

  const setter: Dispatch<SetStateAction<T>> = useCallback(
    (action) => {
      const store = useSessionStore.getState();
      const prev: T = store.uiState?.[key] !== undefined
        ? (store.uiState[key] as T)
        : defaultValue;
      const next = typeof action === 'function'
        ? (action as (prev: T) => T)(prev)
        : action;
      store.setUiState(key, next);
    },
    [useSessionStore, key, defaultValue],
  );

  return [value, setter];
  /* eslint-enable react-hooks/rules-of-hooks */
}
