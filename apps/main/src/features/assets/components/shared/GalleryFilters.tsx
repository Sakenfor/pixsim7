/**
 * GalleryFilters Component
 *
 * Reusable filter controls for gallery surfaces.
 * Supports media type, provider, status, and sort filters.
 */

import type { AssetFilters } from '../../hooks/useAssets';

export interface FilterOption {
  value: string;
  label: string;
}

export interface GalleryFiltersProps {
  /** Current filter values */
  filters: AssetFilters;
  /** Callback when filters change */
  onFiltersChange: (updates: Partial<AssetFilters>) => void;

  // Feature flags - which filters to show
  /** Show search input (default: true) */
  showSearch?: boolean;
  /** Show media type filter (default: true) */
  showMediaType?: boolean;
  /** Show provider filter (default: false) */
  showProvider?: boolean;
  /** Show provider status filter (default: false) */
  showProviderStatus?: boolean;
  /** Show sort filter (default: true) */
  showSort?: boolean;
  /** Show date range filter (default: false) */
  showDateRange?: boolean;
  /** Show dimension filters (default: false) */
  showDimensions?: boolean;
  /** Show lineage filter (default: false) */
  showLineage?: boolean;

  // Dynamic options
  /** Available providers for dropdown */
  providers?: FilterOption[];
  /** Additional sort options beyond new/old */
  extraSortOptions?: FilterOption[];

  // Layout
  /** Layout style: 'horizontal' or 'grid' */
  layout?: 'horizontal' | 'grid';
  /** Additional className */
  className?: string;
}

const selectClasses =
  'px-2 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent';

const inputClasses =
  'px-2 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent';

export function GalleryFilters({
  filters,
  onFiltersChange,
  showSearch = true,
  showMediaType = true,
  showProvider = false,
  showProviderStatus = false,
  showSort = true,
  showDateRange = false,
  showDimensions = false,
  showLineage = false,
  providers = [],
  extraSortOptions = [],
  layout = 'horizontal',
  className = '',
}: GalleryFiltersProps) {
  const containerClasses =
    layout === 'horizontal'
      ? `flex flex-wrap items-center gap-2 ${className}`
      : `grid grid-cols-1 md:grid-cols-4 gap-2 ${className}`;

  return (
    <div className={containerClasses}>
      {/* Search */}
      {showSearch && (
        <input
          type="text"
          placeholder="Search..."
          className={inputClasses}
          value={filters.q || ''}
          onChange={(e) => onFiltersChange({ q: e.target.value || undefined })}
        />
      )}

      {/* Media Type */}
      {showMediaType && (
        <select
          className={selectClasses}
          value={filters.media_type || ''}
          onChange={(e) =>
            onFiltersChange({
              media_type: (e.target.value || undefined) as AssetFilters['media_type'],
            })
          }
        >
          <option value="">All Media</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
          <option value="audio">Audio</option>
          <option value="3d_model">3D Models</option>
        </select>
      )}

      {/* Provider */}
      {showProvider && providers.length > 0 && (
        <select
          className={selectClasses}
          value={filters.provider_id || ''}
          onChange={(e) => onFiltersChange({ provider_id: e.target.value || undefined })}
        >
          <option value="">All Providers</option>
          {providers.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      )}

      {/* Provider Status */}
      {showProviderStatus && (
        <select
          className={selectClasses}
          value={filters.provider_status || ''}
          onChange={(e) =>
            onFiltersChange({
              provider_status: (e.target.value || undefined) as AssetFilters['provider_status'],
            })
          }
        >
          <option value="">All Status</option>
          <option value="ok">Provider OK</option>
          <option value="local_only">Local Only</option>
          <option value="flagged">Flagged</option>
          <option value="unknown">Unknown</option>
        </select>
      )}

      {/* Sort */}
      {showSort && (
        <select
          className={selectClasses}
          value={filters.sort || 'new'}
          onChange={(e) =>
            onFiltersChange({ sort: e.target.value as AssetFilters['sort'] })
          }
        >
          <option value="new">Newest First</option>
          <option value="old">Oldest First</option>
          <option value="size">Largest First</option>
          {extraSortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {/* Date Range (gated) */}
      {showDateRange && (
        <div className="flex gap-1 items-center">
          <input
            type="date"
            className={inputClasses}
            value={filters.created_from || ''}
            onChange={(e) => onFiltersChange({ created_from: e.target.value || undefined })}
          />
          <span className="text-xs text-neutral-500">to</span>
          <input
            type="date"
            className={inputClasses}
            value={filters.created_to || ''}
            onChange={(e) => onFiltersChange({ created_to: e.target.value || undefined })}
          />
        </div>
      )}

      {/* Dimensions (gated) */}
      {showDimensions && (
        <div className="flex gap-1 items-center">
          <input
            type="number"
            placeholder="Min W"
            className={`${inputClasses} w-16`}
            min={0}
            value={filters.min_width ?? ''}
            onChange={(e) =>
              onFiltersChange({ min_width: e.target.value ? Number(e.target.value) : undefined })
            }
          />
          <span className="text-xs">x</span>
          <input
            type="number"
            placeholder="Min H"
            className={`${inputClasses} w-16`}
            min={0}
            value={filters.min_height ?? ''}
            onChange={(e) =>
              onFiltersChange({ min_height: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </div>
      )}

      {/* Lineage (gated) */}
      {showLineage && (
        <select
          className={selectClasses}
          value={
            filters.has_parent === true
              ? 'has_parent'
              : filters.has_parent === false
                ? 'no_parent'
                : filters.has_children === true
                  ? 'has_children'
                  : ''
          }
          onChange={(e) => {
            const v = e.target.value;
            onFiltersChange({
              has_parent: v === 'has_parent' ? true : v === 'no_parent' ? false : undefined,
              has_children: v === 'has_children' ? true : undefined,
            });
          }}
        >
          <option value="">Any Lineage</option>
          <option value="has_parent">Has Parent</option>
          <option value="has_children">Has Children</option>
          <option value="no_parent">Original (No Parent)</option>
        </select>
      )}
    </div>
  );
}

/**
 * Divider for horizontal filter layouts
 */
export function FilterDivider() {
  return <div className="h-6 w-px bg-neutral-300 dark:bg-neutral-600" />;
}
