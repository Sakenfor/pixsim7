/**
 * Shared Gallery Components
 *
 * Reusable components for gallery surfaces:
 * - GalleryFilters: Filter controls (search, media type, sort)
 * - LoadMoreSection: Button or infinite scroll pagination
 * - AssetGrid: Grid layouts with presets
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
  CompactAssetCard,
  type CompactAssetCardProps,
  type ThumbnailGridItem,
} from './CompactAssetCard';
