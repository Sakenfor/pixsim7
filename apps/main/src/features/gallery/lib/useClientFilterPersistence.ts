import { useMemo } from 'react';

import type { ClientFilterState, UseClientFiltersOptions } from './useClientFilters';

/**
 * Returns `{ initialFilterState, onFilterStateChange }` for `useClientFilters`,
 * backed by `localStorage` under the given key.
 */
export function useClientFilterPersistence(storageKey: string): UseClientFiltersOptions {
  return useMemo<UseClientFiltersOptions>(() => ({
    initialFilterState: readStoredFilterState(storageKey),
    onFilterStateChange: (state) => writeStoredFilterState(storageKey, state),
  }), [storageKey]);
}

function readStoredFilterState(key: string): ClientFilterState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: ClientFilterState = {};
    for (const [k, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' || typeof value === 'boolean') {
        result[k] = value;
      } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        result[k] = value as string[];
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeStoredFilterState(key: string, state: ClientFilterState): void {
  try {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(state)) {
      if (v !== undefined) clean[k] = v;
    }
    localStorage.setItem(key, JSON.stringify(clean));
  } catch {
    // Best effort persistence only
  }
}
