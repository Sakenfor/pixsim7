import { useCallback, type Dispatch, type SetStateAction } from 'react';

import { useGenerationScopeStores } from './useGenerationScope';

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
 */
export function usePersistedScopeState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
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
}
