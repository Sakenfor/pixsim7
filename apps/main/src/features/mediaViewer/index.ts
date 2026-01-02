/**
 * Media Viewer Feature
 *
 * Asset viewing, annotation, and pose detection overlays.
 * This feature manages the media viewer UI and its various overlay modes.
 */

// ============================================================================
// Stores
// ============================================================================

export {
  useAssetRegionStore,
  selectSelectedRegionId,
  selectDrawingMode,
  type AssetRegion,
  type ExportedRegion,
} from './stores/assetRegionStore';

export {
  useAssetViewerOverlayStore,
  selectOverlayMode,
  type AssetViewerOverlayMode,
} from './stores/assetViewerOverlayStore';
