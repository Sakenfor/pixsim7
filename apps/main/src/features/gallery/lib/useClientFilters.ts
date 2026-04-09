import { useMemo, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClientFilterValue = string[] | boolean | string | undefined;
export type ClientFilterState = Record<string, ClientFilterValue>;

export interface ClientEnumFilterOption {
  value: string;
  label?: string;
  count?: number;
  /** Optional category key for grouped enum rendering in filter dropdowns. */
  groupKey?: string;
  /** Optional category label shown above grouped enum options. */
  groupLabel?: string;
}

export interface ClientFilterDef<T> {
  key: string;
  label: string;
  icon?: string;
  type: 'enum' | 'boolean' | 'search';
  /** Enum selection behavior (default 'multi'). */
  selectionMode?: 'single' | 'multi';
  order?: number;
  overflow?: boolean;
  isVisible?: (filterState: ClientFilterState) => boolean;
  predicate: (item: T, value: ClientFilterValue) => boolean;
  deriveOptions?: (items: T[], filterState: ClientFilterState) => ClientEnumFilterOption[];
  deriveOptionsWithCounts?: (items: T[], filterState: ClientFilterState) => ClientEnumFilterOption[];
  /** Optional extra UI rendered after each enum option label (e.g. action buttons). */
  renderOptionExtra?: (optionValue: string) => ReactNode;
  /** Number of columns for enum option layout (default 1). */
  columns?: number;
}

export interface UseClientFiltersResult<T> {
  filteredItems: T[];
  filterState: Record<string, ClientFilterValue>;
  visibleDefs: ClientFilterDef<T>[];
  setFilter: (key: string, value: ClientFilterValue) => void;
  resetFilters: () => void;
  derivedOptions: Record<string, ClientEnumFilterOption[]>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseClientFiltersOptions {
  /** Pre-populate filter state (e.g. restored from localStorage). */
  initialFilterState?: ClientFilterState;
  /** Called whenever filter state changes (for persistence). */
  onFilterStateChange?: (state: ClientFilterState) => void;
}

export function useClientFilters<T>(
  items: T[],
  defs: ClientFilterDef<T>[],
  options?: UseClientFiltersOptions,
): UseClientFiltersResult<T> {
  const [filterState, setFilterState] = useState<Record<string, ClientFilterValue>>(
    () => options?.initialFilterState ?? {},
  );

  const onFilterStateChangeRef = useRef(options?.onFilterStateChange);
  onFilterStateChangeRef.current = options?.onFilterStateChange;

  const setFilter = useCallback((key: string, value: ClientFilterValue) => {
    setFilterState((prev) => {
      // Normalize empty values to undefined so inactive filters disappear
      const normalized =
        value === '' || (Array.isArray(value) && value.length === 0) ? undefined : value;
      if (prev[key] === normalized) return prev;
      const next = { ...prev, [key]: normalized };
      onFilterStateChangeRef.current?.(next);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilterState({});
    onFilterStateChangeRef.current?.({});
  }, []);

  const visibleDefs = useMemo(
    () => defs.filter((def) => !def.isVisible || def.isVisible(filterState)),
    [defs, filterState],
  );

  useEffect(() => {
    const visibleKeys = new Set(visibleDefs.map((def) => def.key));
    const hasHiddenKeys = Object.keys(filterState).some((key) => !visibleKeys.has(key));
    if (!hasHiddenKeys) return;

    setFilterState((prev) => {
      let changed = false;
      const next: ClientFilterState = { ...prev };
      for (const key of Object.keys(prev)) {
        if (!visibleKeys.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      if (changed) {
        onFilterStateChangeRef.current?.(next);
      }
      return changed ? next : prev;
    });
  }, [visibleDefs, filterState]);

  // Derive options from full unfiltered items so counts stay stable
  const derivedOptions = useMemo(() => {
    const result: Record<string, ClientEnumFilterOption[]> = {};
    for (const def of visibleDefs) {
      if (def.type !== 'enum') continue;

      if (def.deriveOptionsWithCounts) {
        const rawOptions = def.deriveOptionsWithCounts(items, filterState);
        result[def.key] = rawOptions.map((opt) => ({
          value: opt.value,
          label: opt.label || opt.value,
          ...(typeof opt.count === 'number' ? { count: opt.count } : {}),
          ...(opt.groupKey ? { groupKey: opt.groupKey } : {}),
          ...(opt.groupLabel ? { groupLabel: opt.groupLabel } : {}),
        }));
        continue;
      }

      if (!def.deriveOptions) continue;
      const rawOptions = def.deriveOptions(items, filterState);
      result[def.key] = rawOptions.map((opt) => {
        const count = items.filter((item) =>
          def.predicate(item, [opt.value]),
        ).length;
        return {
          value: opt.value,
          label: opt.label || opt.value,
          count,
          ...(opt.groupKey ? { groupKey: opt.groupKey } : {}),
          ...(opt.groupLabel ? { groupLabel: opt.groupLabel } : {}),
        };
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
