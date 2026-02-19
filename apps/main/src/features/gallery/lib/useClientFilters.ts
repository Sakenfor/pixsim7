import { useMemo, useState, useCallback, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClientFilterValue = string[] | boolean | string | undefined;
export type ClientFilterState = Record<string, ClientFilterValue>;

export interface ClientEnumFilterOption {
  value: string;
  label?: string;
  count?: number;
}

export interface ClientFilterDef<T> {
  key: string;
  label: string;
  icon?: string;
  type: 'enum' | 'boolean' | 'search';
  order?: number;
  overflow?: boolean;
  isVisible?: (filterState: ClientFilterState) => boolean;
  predicate: (item: T, value: ClientFilterValue) => boolean;
  deriveOptions?: (items: T[], filterState: ClientFilterState) => ClientEnumFilterOption[];
  deriveOptionsWithCounts?: (items: T[], filterState: ClientFilterState) => ClientEnumFilterOption[];
}

export interface UseClientFiltersResult<T> {
  filteredItems: T[];
  filterState: Record<string, ClientFilterValue>;
  visibleDefs: ClientFilterDef<T>[];
  setFilter: (key: string, value: ClientFilterValue) => void;
  resetFilters: () => void;
  derivedOptions: Record<string, Array<{ value: string; label: string; count?: number }>>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useClientFilters<T>(
  items: T[],
  defs: ClientFilterDef<T>[],
): UseClientFiltersResult<T> {
  const [filterState, setFilterState] = useState<Record<string, ClientFilterValue>>({});

  const setFilter = useCallback((key: string, value: ClientFilterValue) => {
    setFilterState((prev) => {
      // Normalize empty values to undefined so inactive filters disappear
      const normalized =
        value === '' || (Array.isArray(value) && value.length === 0) ? undefined : value;
      if (prev[key] === normalized) return prev;
      return { ...prev, [key]: normalized };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilterState({});
  }, []);

  const visibleDefs = useMemo(
    () => defs.filter((def) => !def.isVisible || def.isVisible(filterState)),
    [defs, filterState],
  );

  useEffect(() => {
    const visibleKeys = new Set(visibleDefs.map((def) => def.key));
    setFilterState((prev) => {
      let changed = false;
      const next: ClientFilterState = { ...prev };
      for (const key of Object.keys(prev)) {
        if (!visibleKeys.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [visibleDefs]);

  // Derive options from full unfiltered items so counts stay stable
  const derivedOptions = useMemo(() => {
    const result: Record<string, Array<{ value: string; label: string; count?: number }>> = {};
    for (const def of visibleDefs) {
      if (def.type !== 'enum') continue;

      if (def.deriveOptionsWithCounts) {
        const rawOptions = def.deriveOptionsWithCounts(items, filterState);
        result[def.key] = rawOptions.map((opt) => ({
          value: opt.value,
          label: opt.label || opt.value,
          ...(typeof opt.count === 'number' ? { count: opt.count } : {}),
        }));
        continue;
      }

      if (!def.deriveOptions) continue;
      const rawOptions = def.deriveOptions(items, filterState);
      result[def.key] = rawOptions.map((opt) => {
        const count = items.filter((item) =>
          def.predicate(item, [opt.value]),
        ).length;
        return { value: opt.value, label: opt.label || opt.value, count };
      });
    }
    return result;
  }, [items, visibleDefs, filterState]);

  // Apply active filters: AND between filters, OR within enum filters
  const filteredItems = useMemo(() => {
    const activeDefs = visibleDefs.filter((d) => {
      const v = filterState[d.key];
      return v !== undefined && v !== '' && v !== false;
    });
    if (activeDefs.length === 0) return items;

    return items.filter((item) =>
      activeDefs.every((def) => def.predicate(item, filterState[def.key])),
    );
  }, [items, visibleDefs, filterState]);

  return { filteredItems, filterState, visibleDefs, setFilter, resetFilters, derivedOptions };
}
