/**
 * Gallery Tool Plugin Registry
 *
 * @deprecated Use `galleryToolSelectors` from '@lib/plugins/catalogSelectors' instead.
 * The PluginCatalog is now the source of truth for gallery tools.
 *
 * Registration is now done via `registerGalleryTools()` in main.tsx using pluginRuntime.
 */

// Re-export catalog selectors as the new API
export { galleryToolSelectors } from '@lib/plugins/catalogSelectors';

// Legacy re-export for backwards compatibility (deprecated)
export { galleryToolRegistry } from './core/types';
