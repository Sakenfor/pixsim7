/**
 * useFilterPersistence Hook
 *
 * Shared filter state management with URL and sessionStorage persistence.
 * Automatically syncs filter state to URL query params and sessionStorage.
 *
 * Used by: useAssetsController (potentially others)
 */

import { useState, useCallback, useMemo } from 'react';

export interface UseFilterPersistenceOptions<T extends Record<string, any>> {
  /** Unique key for sessionStorage */
  sessionKey: string;
  /** Initial/default filter values */
  initialFilters: T;
  /** Whether to sync to URL (default: true) */
  syncToUrl?: boolean;
  /** Whether to sync to sessionStorage (default: true) */
  syncToSession?: boolean;
}

export interface UseFilterPersistenceResult<T> {
  /** Current filter state */
  filters: T;
  /** Update filters (merges partial updates) */
  setFilters: (partial: Partial<T>) => void;
  /** Reset filters to initial values */
  resetFilters: () => void;
  /** Helper to read initial value from URL or session */
  initFromUrl: (key: keyof T, defaultValue: any) => any;
}

/**
 * Read initial filter state from URL params and sessionStorage
 */
function readInitialFilters<T extends Record<string, any>>(
  sessionKey: string,
  initialFilters: T
): T {
  // Read from URL
  const params = new URLSearchParams(window.location.search);

  // Read from sessionStorage
  let persisted: Partial<T> = {};
  try {
    const stored = sessionStorage.getItem(sessionKey);
    if (stored) {
      persisted = JSON.parse(stored);
    }
  } catch (err) {
    console.warn(`Failed to parse sessionStorage for key "${sessionKey}":`, err);
  }

  // Merge: initial < persisted < URL
  const merged = { ...initialFilters };

  for (const key in merged) {
    // Check sessionStorage
    if (key in persisted) {
      merged[key] = persisted[key];
    }
    // Check URL (highest priority)
    const urlValue = params.get(key);
    if (urlValue !== null) {
      // Try to parse as the same type as initial value
      const initial = initialFilters[key];
      if (typeof initial === 'number') {
        merged[key] = Number(urlValue) as any;
      } else if (typeof initial === 'boolean') {
        merged[key] = (urlValue === 'true') as any;
      } else {
        merged[key] = urlValue as any;
      }
    }
  }

  return merged;
}

/**
 * Hook for filter state with URL and sessionStorage persistence
 *
 * @example
 * ```tsx
 * const { filters, setFilters, resetFilters } = useFilterPersistence({
 *   sessionKey: 'assets_filters',
 *   initialFilters: { mediaType: 'all', providerId: 'all', searchQuery: '' },
 * });
 *
 * // Update filters (automatically syncs to URL + sessionStorage)
 * setFilters({ mediaType: 'image' });
 *
 * // Reset to defaults
 * resetFilters();
 * ```
 */
export function useFilterPersistence<T extends Record<string, any>>(
  options: UseFilterPersistenceOptions<T>
): UseFilterPersistenceResult<T> {
  const {
    sessionKey,
    initialFilters,
    syncToUrl = true,
    syncToSession = true,
  } = options;

  // Initialize from URL + sessionStorage
  const initial = useMemo(
    () => readInitialFilters(sessionKey, initialFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // Only run once on mount
  );

  const [filters, setFiltersState] = useState<T>(initial);

  // Persist to URL and sessionStorage
  const persistFilters = useCallback(
    (nextFilters: T) => {
      // Update URL
      if (syncToUrl) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(nextFilters)) {
          // Only add non-default values to URL
          if (value != null && value !== '' && value !== 'all') {
            params.set(key, String(value));
          }
        }
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, '', newUrl);
      }

      // Update sessionStorage
      if (syncToSession) {
        try {
          sessionStorage.setItem(sessionKey, JSON.stringify(nextFilters));
        } catch (err) {
          console.warn(`Failed to write sessionStorage for key "${sessionKey}":`, err);
        }
      }
    },
    [sessionKey, syncToUrl, syncToSession]
  );

  const setFilters = useCallback(
    (partial: Partial<T>) => {
      setFiltersState((prev) => {
        const next = { ...prev, ...partial };
        persistFilters(next);
        return next;
      });
    },
    [persistFilters]
  );

  const resetFilters = useCallback(() => {
    setFiltersState(initialFilters);
    persistFilters(initialFilters);
  }, [initialFilters, persistFilters]);

  const initFromUrl = useCallback(
    (key: keyof T, defaultValue: any) => {
      const params = new URLSearchParams(window.location.search);
      let persisted: any = null;
      try {
        const stored = sessionStorage.getItem(sessionKey);
        if (stored) {
          persisted = JSON.parse(stored);
        }
      } catch {
        // Ignore
      }

      return params.get(key as string) || persisted?.[key] || defaultValue;
    },
    [sessionKey]
  );

  return {
    filters,
    setFilters,
    resetFilters,
    initFromUrl,
  };
}
