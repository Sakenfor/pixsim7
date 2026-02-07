/**
 * useFilterPersistence Hook
 *
 * Shared filter state management with URL and sessionStorage persistence.
 * Automatically syncs filter state to URL query params and sessionStorage.
 *
 * Used by: useAssetsController (potentially others)
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';

export interface UseFilterPersistenceOptions<T extends Record<string, any>> {
  /** Unique key for sessionStorage */
  sessionKey: string;
  /** Initial/default filter values */
  initialFilters: T;
  /** Whether to sync to URL (default: true) */
  syncToUrl?: boolean;
  /** Whether to sync to sessionStorage (default: true) */
  syncToSession?: boolean;
  /** Whether to read initial values from sessionStorage (default: same as syncToSession) */
  readFromSession?: boolean;
  /** Only use session fallback when the URL has no query string */
  sessionFallbackOnlyWhenNoQuery?: boolean;
  /** Whether to sync from URL on browser navigation (default: true when syncToUrl is true) */
  syncFromUrl?: boolean;
  /** Keys that should be parsed as arrays when present in the URL */
  arrayKeys?: string[];
  /** Allow URL params not present in initialFilters to be loaded */
  allowUnknownKeys?: boolean;
  /** URL params to ignore when allowUnknownKeys is true */
  excludeUrlKeys?: string[];
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
  initialFilters: T,
  options?: {
    arrayKeys?: string[];
    allowUnknownKeys?: boolean;
    excludeUrlKeys?: string[];
    readFromSession?: boolean;
    sessionFallbackOnlyWhenNoQuery?: boolean;
  }
): T {
  // Read from URL
  const params = new URLSearchParams(window.location.search);
  const arrayKeySet = new Set(options?.arrayKeys ?? []);
  const excludeKeySet = new Set(options?.excludeUrlKeys ?? []);
  const hasNonExcludedParams = Array.from(params.keys()).some(
    (key) => !excludeKeySet.has(key),
  );

  // Read from sessionStorage
  let persisted: Partial<T> = {};
  const shouldReadSession =
    options?.readFromSession !== false &&
    (!options?.sessionFallbackOnlyWhenNoQuery || !hasNonExcludedParams);
  if (shouldReadSession) {
    try {
      const stored = sessionStorage.getItem(sessionKey);
      if (stored) {
        persisted = JSON.parse(stored);
      }
    } catch (err) {
      console.warn(`Failed to parse sessionStorage for key "${sessionKey}":`, err);
    }
  }

  // Merge: initial < persisted < URL
  const merged = { ...initialFilters };

  for (const key in merged) {
    // Check sessionStorage
    if (key in persisted) {
      merged[key] = persisted[key];
    }
    // Check URL (highest priority)
    const urlValues = params.getAll(key);
    if (urlValues.length > 1 || arrayKeySet.has(key)) {
      const values = urlValues.length > 0 ? urlValues : [];
      if (values.length === 0) continue;
      if (values.length === 1 && values[0].includes(',')) {
        merged[key] = values[0].split(',').map((v) => v.trim()).filter(Boolean) as any;
      } else {
        merged[key] = values.filter((v) => v !== '') as any;
      }
      continue;
    }
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

  if (options?.allowUnknownKeys) {
    params.forEach((value, key) => {
      if (key in merged) return;
      if (excludeKeySet.has(key)) return;
      const values = params.getAll(key);
      if (values.length > 1) {
        merged[key as keyof T] = values.filter((v) => v !== '') as any;
      } else {
        merged[key as keyof T] = value as any;
      }
    });
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
    readFromSession = syncToSession,
    sessionFallbackOnlyWhenNoQuery = false,
    syncFromUrl = syncToUrl,
    arrayKeys,
    allowUnknownKeys = false,
    excludeUrlKeys = [],
  } = options;

  // Initialize from URL + sessionStorage
  const initial = useMemo(
    () =>
      readInitialFilters(sessionKey, initialFilters, {
        arrayKeys,
        allowUnknownKeys,
        excludeUrlKeys,
        readFromSession,
        sessionFallbackOnlyWhenNoQuery,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // Only run once on mount
  );

  const [filters, setFiltersState] = useState<T>(initial);
  const filtersRef = useRef(filters);
  const popstatePendingRef = useRef(false);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // Persist to URL and sessionStorage
  const persistFilters = useCallback(
    (nextFilters: T) => {
      // Update URL
      if (syncToUrl) {
        const params = new URLSearchParams(window.location.search);
        // Remove existing filter keys, preserve unrelated params (e.g. page/source)
        Object.keys(nextFilters).forEach((key) => {
          params.delete(key);
        });
        for (const [key, value] of Object.entries(nextFilters)) {
          if (value == null || value === '' || value === 'all') {
            continue;
          }
          if (Array.isArray(value)) {
            const entries = value.filter((v) => v !== '' && v !== 'all');
            if (entries.length === 0) continue;
            entries.forEach((entry) => {
              params.append(key, String(entry));
            });
            continue;
          }
          params.set(key, String(value));
        }
        const nextQuery = params.toString();
        const newUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        if (syncFromUrl && !popstatePendingRef.current) {
          popstatePendingRef.current = true;
          const dispatch = () => {
            popstatePendingRef.current = false;
            window.dispatchEvent(new PopStateEvent('popstate'));
          };
          setTimeout(dispatch, 0);
        }
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
    [initialFilters, sessionKey, syncToUrl, syncToSession, syncFromUrl]
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

  useEffect(() => {
    if (!syncFromUrl) return;

    const handlePopState = () => {
      const next = readInitialFilters(sessionKey, initialFilters, {
        arrayKeys,
        allowUnknownKeys,
        excludeUrlKeys,
        readFromSession,
        sessionFallbackOnlyWhenNoQuery,
      });

      const prev = filtersRef.current;
      const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
      let changed = false;
      for (const key of keys) {
        const prevValue = (prev as any)[key];
        const nextValue = (next as any)[key];
        if (Array.isArray(prevValue) || Array.isArray(nextValue)) {
          const prevArr = Array.isArray(prevValue) ? prevValue : [];
          const nextArr = Array.isArray(nextValue) ? nextValue : [];
          if (prevArr.length !== nextArr.length || prevArr.some((v, i) => v !== nextArr[i])) {
            changed = true;
            break;
          }
        } else if (prevValue !== nextValue) {
          changed = true;
          break;
        }
      }

      if (changed) {
        setFiltersState(next);
        if (syncToSession) {
          try {
            sessionStorage.setItem(sessionKey, JSON.stringify(next));
          } catch (err) {
            console.warn(`Failed to write sessionStorage for key "${sessionKey}":`, err);
          }
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    allowUnknownKeys,
    arrayKeys,
    excludeUrlKeys,
    initialFilters,
    readFromSession,
    sessionFallbackOnlyWhenNoQuery,
    sessionKey,
    syncFromUrl,
    syncToSession,
  ]);

  const initFromUrl = useCallback(
    (key: keyof T, defaultValue: any) => {
      const params = new URLSearchParams(window.location.search);
      let persisted: any = null;
      const shouldReadSession =
        readFromSession !== false &&
        (!sessionFallbackOnlyWhenNoQuery || params.toString() === '');
      if (shouldReadSession) {
        try {
          const stored = sessionStorage.getItem(sessionKey);
          if (stored) {
            persisted = JSON.parse(stored);
          }
        } catch {
          // Ignore
        }
      }

      const urlValues = params.getAll(key as string);
      if (urlValues.length > 1) {
        return urlValues;
      }
      return params.get(key as string) || persisted?.[key] || defaultValue;
    },
    [readFromSession, sessionFallbackOnlyWhenNoQuery, sessionKey]
  );

  return {
    filters,
    setFilters,
    resetFilters,
    initFromUrl,
  };
}
