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
// Hooks
// ============================================================================

export {
  useGallerySurfaceController,
  type GallerySurfaceConfig,
} from './hooks/useGallerySurfaceController';

export {
  useCuratorGalleryController,
  type CuratorFilters,
  type CuratorViewMode,
  type CuratorGalleryController,
} from './hooks/useCuratorGalleryController';

// ============================================================================
// Lib - Gallery System
// ============================================================================

// Re-export from lib/core (former lib/gallery)
export * from './lib/core';
