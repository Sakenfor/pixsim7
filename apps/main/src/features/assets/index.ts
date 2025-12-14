/**
 * Assets Feature
 *
 * Asset management, browsing, selection, and local folder integration.
 */

// ============================================================================
// Components - Gallery Surfaces
// ============================================================================

export { CuratorGallerySurface } from './components/CuratorGallerySurface';
export { DebugGallerySurface } from './components/DebugGallerySurface';
export { DefaultGallerySurface } from './components/DefaultGallerySurface';
export { ReviewGallerySurface } from './components/ReviewGallerySurface';

// ============================================================================
// Components - Asset Sources & Panels
// ============================================================================

export { LocalFoldersPanel } from './components/LocalFoldersPanel';
export { LocalFoldersSource } from './components/LocalFoldersSource';
export { RemoteGallerySource } from './components/RemoteGallerySource';
export { TreeFolderView } from './components/TreeFolderView';

// ============================================================================
// Components - Cubes & Viewers
// ============================================================================

export { GalleryCubeExpansion } from './components/GalleryCubeExpansion';
export { MediaViewerCube } from './components/MediaViewerCube';

// ============================================================================
// Hooks
// ============================================================================

export { useAsset } from './hooks/useAsset';

export { useAssets } from './hooks/useAssets';
export type { AssetSummary, AssetFilters } from './hooks/useAssets';

export { useAssetsController } from './hooks/useAssetsController';

export { useAssetViewer } from './hooks/useAssetViewer';

export { useLocalFoldersController } from './hooks/useLocalFoldersController';

// ============================================================================
// Stores
// ============================================================================

export { useAssetPickerStore } from './stores/assetPickerStore';

export { useAssetSelectionStore } from './stores/assetSelectionStore';

export {
  useAssetViewerStore,
  selectIsViewerOpen,
  selectCanNavigatePrev,
  selectCanNavigateNext,
  type ViewerAsset,
  type ViewerMode,
} from './stores/assetViewerStore';

export {
  useLocalFolders,
  getLocalThumbnailBlob,
  setLocalThumbnailBlob,
  generateThumbnail,
  type LocalAsset,
} from './stores/localFoldersStore';

// ============================================================================
// Lib - Asset Actions & API
// ============================================================================

export { createAssetActions } from './lib/assetCardActions';
export type { AssetActionHandlers, AssetActions } from './lib/assetCardActions';

// ============================================================================
// Lib - Asset Events
// ============================================================================

export { assetEvents } from './lib/assetEvents';

export {
  deleteAsset,
  uploadAssetToProvider,
  getAsset,
  extractFrame,
  type AssetResponse,
  type ExtractFrameRequest,
} from './lib/api';
