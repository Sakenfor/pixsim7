import type { ReactNode } from 'react';

import { ClientFilterBar } from '@features/gallery/components/ClientFilterBar';
import {
  useClientFilters,
  type ClientFilterState,
  type ClientFilterDef,
  type UseClientFiltersOptions,
} from '@features/gallery/lib/useClientFilters';

export interface ClientFilteredGallerySectionRenderContext<T> {
  filterState: ClientFilterState;
  setFilter: (key: string, value: ClientFilterState[string]) => void;
  resetFilters: () => void;
  derivedOptions: Record<string, Array<{ value: string; label: string; count?: number }>>;
  visibleDefs: ClientFilterDef<T>[];
}

interface ClientFilteredGallerySectionProps<T> {
  items: T[];
  filterDefs: ClientFilterDef<T>[];
  filterOptions?: UseClientFiltersOptions;
  children: (filteredItems: T[], context: ClientFilteredGallerySectionRenderContext<T>) => ReactNode;
  filterBarClassName?: string;
  toolbarClassName?: string;
  renderToolbarExtra?: (
    filteredItems: T[],
    context: ClientFilteredGallerySectionRenderContext<T>,
  ) => ReactNode;
}

/**
 * Shared client-side filtering wrapper for gallery-like surfaces.
 * Owns filter state and renders a common filter bar.
 */
export function ClientFilteredGallerySection<T>({
  items,
  filterDefs,
  filterOptions,
  children,
  filterBarClassName,
  toolbarClassName,
  renderToolbarExtra,
}: ClientFilteredGallerySectionProps<T>) {
  const {
    filteredItems,
    filterState,
    visibleDefs,
    setFilter,
    resetFilters,
    derivedOptions,
  } = useClientFilters(items, filterDefs, filterOptions);
  const renderContext: ClientFilteredGallerySectionRenderContext<T> = {
    filterState,
    setFilter,
    resetFilters,
    derivedOptions,
    visibleDefs,
  };

  return (
    <>
      {items.length > 0 && (
        <div className={toolbarClassName}>
          <div className={filterBarClassName}>
            <ClientFilterBar
              defs={visibleDefs}
              filterState={filterState}
              derivedOptions={derivedOptions}
              onFilterChange={setFilter}
              onReset={resetFilters}
            />
          </div>
          {renderToolbarExtra?.(filteredItems, renderContext)}
        </div>
      )}
      {children(filteredItems, renderContext)}
    </>
  );
}
