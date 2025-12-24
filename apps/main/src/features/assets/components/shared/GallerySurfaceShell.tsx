/**
 * GallerySurfaceShell Component
 *
 * Reusable layout shell for gallery surfaces. Provides consistent structure:
 * - Page wrapper with padding
 * - Header with title, subtitle, and action slots
 * - Optional filters section
 * - Error/empty/loading states
 * - Children slot for grid content
 * - Load more section
 *
 * Surface-specific logic (selection, review decisions, view modes) stays in the surface.
 */

import type { ReactNode } from 'react';
import type { AssetFilters } from '../../hooks/useAssets';
import { GalleryFilters, type FilterOption } from './GalleryFilters';
import { LoadMoreSection, type LoadMoreSectionProps } from './LoadMoreSection';

export interface GallerySurfaceShellProps {
  /** Page title */
  title: string;
  /** Optional subtitle under the title */
  subtitle?: string;
  /** Actions rendered in the header (right side) */
  headerActions?: ReactNode;

  // Filters configuration
  /** Current filter values (if undefined, filters section is hidden) */
  filters?: AssetFilters;
  /** Callback when filters change */
  onFiltersChange?: (updates: Partial<AssetFilters>) => void;
  /** Show search input (default: true) */
  showSearch?: boolean;
  /** Show media type filter (default: true) */
  showMediaType?: boolean;
  /** Show sort filter (default: true) */
  showSort?: boolean;
  /** Show provider filter */
  showProvider?: boolean;
  /** Show provider status filter */
  showProviderStatus?: boolean;
  /** Available providers for dropdown */
  providers?: FilterOption[];
  /** Additional sort options beyond new/old */
  extraSortOptions?: FilterOption[];
  /** Filters layout: 'horizontal' or 'grid' */
  filtersLayout?: 'horizontal' | 'grid';
  /** Optional header for filters section */
  filtersHeader?: ReactNode;
  /** Additional content to render after filters (e.g., "Select All" button) */
  filtersActions?: ReactNode;

  // Content between filters and grid
  /** Selection summary or other content above the grid */
  selectionSummary?: ReactNode;

  // State handling
  /** Error message to display */
  error?: string | null;
  /** Whether currently loading */
  loading?: boolean;
  /** Custom loading content (shown when loading and no children) */
  loadingContent?: ReactNode;
  /** Custom empty state (shown when itemCount is 0 and not loading) */
  emptyState?: ReactNode;

  // Load more configuration
  /** Whether there are more items to load */
  hasMore?: boolean;
  /** Callback to load more items */
  onLoadMore?: () => void;
  /** Number of items currently loaded */
  itemCount?: number;
  /** Load more mode: 'button' or 'infinite' */
  loadMoreMode?: LoadMoreSectionProps['mode'];
  /** Root margin for infinite scroll */
  loadMoreRootMargin?: string;

  /** Grid/list content (rendered between filters and load-more) */
  children: ReactNode;

  /** Additional className for the outer container */
  className?: string;
}

/**
 * GallerySurfaceShell provides consistent layout for gallery surfaces.
 *
 * Example usage:
 * ```tsx
 * <GallerySurfaceShell
 *   title="Asset Review"
 *   headerActions={<Button>Help</Button>}
 *   filters={filters}
 *   onFiltersChange={setFilters}
 *   error={error}
 *   hasMore={hasMore}
 *   onLoadMore={loadMore}
 *   itemCount={assets.length}
 * >
 *   <AssetGrid preset="review">
 *     {assets.map(asset => <MediaCard ... />)}
 *   </AssetGrid>
 * </GallerySurfaceShell>
 * ```
 */
export function GallerySurfaceShell({
  title,
  subtitle,
  headerActions,
  filters,
  onFiltersChange,
  showSearch = true,
  showMediaType = true,
  showSort = true,
  showProvider = false,
  showProviderStatus = false,
  providers,
  extraSortOptions,
  filtersLayout = 'horizontal',
  filtersHeader,
  filtersActions,
  selectionSummary,
  error,
  loading = false,
  loadingContent,
  emptyState,
  hasMore = false,
  onLoadMore,
  itemCount = 0,
  loadMoreMode = 'button',
  loadMoreRootMargin,
  children,
  className = '',
}: GallerySurfaceShellProps) {
  const showFilters = filters && onFiltersChange;
  const showEmpty = !loading && itemCount === 0 && emptyState;
  const showLoading = loading && itemCount === 0 && loadingContent;

  return (
    <div className={`p-6 space-y-4 content-with-dock min-h-screen ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>
          )}
        </div>
        {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
      </div>

      {/* Selection Summary (surface-specific) */}
      {selectionSummary}

      {/* Filters */}
      {showFilters && (
        <div className="bg-neutral-50 dark:bg-neutral-800 p-4 rounded border border-neutral-200 dark:border-neutral-700 space-y-3">
          {(filtersHeader || filtersActions) && (
            <div className="flex items-center justify-between">
              {filtersHeader || <div />}
              {filtersActions}
            </div>
          )}
          <GalleryFilters
            filters={filters}
            onFiltersChange={onFiltersChange}
            showSearch={showSearch}
            showMediaType={showMediaType}
            showSort={showSort}
            showProvider={showProvider}
            showProviderStatus={showProviderStatus}
            providers={providers}
            extraSortOptions={extraSortOptions}
            layout={filtersLayout}
          />
        </div>
      )}

      {/* Error */}
      {error && <div className="text-red-600 text-sm">{error}</div>}

      {/* Loading State */}
      {showLoading && loadingContent}

      {/* Empty State */}
      {showEmpty && emptyState}

      {/* Main Content (grid/list) */}
      {!showEmpty && !showLoading && children}

      {/* Load More */}
      {onLoadMore && (
        <LoadMoreSection
          hasMore={hasMore}
          loading={loading}
          onLoadMore={onLoadMore}
          itemCount={itemCount}
          mode={loadMoreMode}
          rootMargin={loadMoreRootMargin}
        />
      )}
    </div>
  );
}
