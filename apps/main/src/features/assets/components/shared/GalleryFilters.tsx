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
  'px-2 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500';

const inputClasses =
  'px-2 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500';

export function GalleryFilters({
  filters,
  onFiltersChange,
  showSearch = true,
  showMediaType = true,
  showProvider = false,
  showProviderStatus = false,
  showSort = true,
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
          {extraSortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
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
