/**
 * Shared Gallery Components
 *
 * Reusable components for gallery surfaces:
 * - GalleryFilters: Filter controls (search, media type, sort)
 * - LoadMoreSection: Button or infinite scroll pagination
 * - AssetGrid: Grid layouts with presets
 * - PaginationStrip: Compact toolbar pagination chip (prev / page-jump / next)
 * - BottomPagination: Centered bottom page nav (Prev | Page X of Y | Next)
 * - GalleryToolsStrip: Inline selection tools (badge + tool chips + expanded content)
 */

export {
  GalleryFilters,
  FilterDivider,
  type GalleryFiltersProps,
  type FilterOption,
} from './GalleryFilters';

export {
  LoadMoreSection,
  useInfiniteScroll,
  type LoadMoreSectionProps,
} from './LoadMoreSection';

export {
  AssetGrid,
  AssetCardWrapper,
  SelectionIndicator,
  type AssetGridProps,
  type GridPreset,
  type AssetCardWrapperProps,
  type SelectionIndicatorProps,
} from './AssetGrid';

export {
  GallerySurfaceShell,
  type GallerySurfaceShellProps,
} from './GallerySurfaceShell';

export {
  ClientFilteredGallerySection,
} from './ClientFilteredGallerySection';

export {
  PaginationStrip,
  type PaginationStripProps,
} from './PaginationStrip';

export {
  BottomPagination,
  type BottomPaginationProps,
} from './BottomPagination';

export {
  GalleryToolsStrip,
  type GalleryToolsStripProps,
} from './GalleryToolsStrip';
