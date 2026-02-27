/**
 * Gallery Feature Module
 *
 * Gallery UI components for asset browsing, surface switching, and layout controls.
 *
 * @example
 * ```typescript
 * // Import from barrel
 * import { GallerySurfaceHost, GallerySurfaceSwitcher, GalleryLayoutControls } from '@features/gallery';
 *
 * // Or import specific modules
 * import { GalleryToolsPanel } from '@features/gallery/components/panels/GalleryToolsPanel';
 * ```
 */

// ============================================================================
// Components - Surface Management
// ============================================================================

export { GallerySurfaceHost } from './components/GallerySurfaceHost';
export { GallerySurfaceSwitcher } from './components/GallerySurfaceSwitcher';

// ============================================================================
// Components - Layout
// ============================================================================

export { GalleryLayoutControls } from './components/GalleryLayoutControls';

// ============================================================================
// Components - Panels
// ============================================================================

export { GalleryToolsPanel, CompactGalleryToolsPanel } from './components/panels/GalleryToolsPanel';

// ============================================================================
// Components - Mini Gallery
// ============================================================================

export { MiniGallery, type MiniGalleryProps } from './components/MiniGallery';

// ============================================================================
// Hooks
// ============================================================================

export {
  useGallerySurfaceController,
  type GallerySurfaceConfig,
} from './hooks/useGallerySurfaceController';

// ============================================================================
// Lib - Gallery System
// ============================================================================

// Re-export from lib/core (former lib/gallery)
export * from './lib/core';

// ============================================================================
// Lib - Client-side Filters
// ============================================================================

export { useClientFilters, type ClientFilterDef, type ClientFilterValue } from './lib/useClientFilters';
export { toMultiFilterValue, fromMultiFilterValue, dedupeOptions } from './lib/filterValueHelpers';
export { useFilterChipState, type UseFilterChipStateResult } from './lib/useFilterChipState';
export {
  ClientFilterBar,
  FilterChip,
  FilterDropdown,
  FilterContent,
  type FilterChipProps,
  type FilterDropdownProps,
  type FilterContentProps,
} from './components/ClientFilterBar';
