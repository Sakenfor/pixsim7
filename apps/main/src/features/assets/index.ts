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
export { AssetDetailModal } from './components/AssetDetailModal';

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

// ============================================================================
// Components - Filters
// ============================================================================

export { DynamicFilters } from './components/DynamicFilters';

// ============================================================================
// Hooks
// ============================================================================

export { useAsset } from './hooks/useAsset';

export { useAssets } from './hooks/useAssets';
export type { AssetFilters, AssetModel } from './hooks/useAssets';
// AssetResponse is exported from ./lib/api for API boundary access

export { useAssetsController } from './hooks/useAssetsController';

export { useAssetViewer } from './hooks/useAssetViewer';

export { useFilterMetadata } from './hooks/useFilterMetadata';

export { useLocalFoldersController } from './hooks/useLocalFoldersController';

// ============================================================================
// Stores
// ============================================================================

export { useAssetPickerStore } from './stores/assetPickerStore';

export { useAssetSelectionStore } from './stores/assetSelectionStore';

export { useAssetDetailStore } from './stores/assetDetailStore';

export { useAssetSettingsStore } from './stores/assetSettingsStore';

export {
  useAssetViewerStore,
  selectIsViewerOpen,
  selectCanNavigatePrev,
  selectCanNavigateNext,
  type ViewerAsset,
  type ViewerMode,
  type ViewerSettings,
  type GalleryQualityMode,
} from './stores/assetViewerStore';

export {
  useLocalFolders,
  getLocalThumbnailBlob,
  setLocalThumbnailBlob,
  generateThumbnail,
  type LocalAsset,
} from './stores/localFoldersStore';

export {
  useMediaSettingsStore,
  getEffectiveServerSettings,
  type ServerMediaSettings,
} from './stores/mediaSettingsStore';

// ============================================================================
// Lib - Asset Actions & API
// ============================================================================

export { createAssetActions } from './lib/assetCardActions';
export type { AssetActionHandlers, AssetActions } from './lib/assetCardActions';

// ============================================================================
// Models - Internal Asset Types
// ============================================================================

export {
  fromAssetResponse,
  fromAssetResponses,
  toViewerAsset,
  toViewerAssets,
  toSelectedAsset,
  type AssetMediaType,
  type AssetSyncStatus,
  type AssetProviderStatus,
  type TagSummary,
} from './models/asset';
// Note: AssetModel is re-exported via useAssets hook above

// ============================================================================
// Lib - Asset Media Type
// ============================================================================

export { resolveAssetMediaType, resolveAssetMediaTypes } from './lib/assetMediaType';

// ============================================================================
// Lib - Asset Events
// ============================================================================

export { assetEvents } from './lib/assetEvents';

export { useAssetContextMenu, useRegisterAssetContext } from './lib/assetContextResolver';

export {
  deleteAsset,
  uploadAssetToProvider,
  getAsset,
  getFilterMetadata,
  extractFrame,
  downloadAsset,
  type AssetResponse,
  type ExtractFrameRequest,
  type FilterDefinition,
  type FilterMetadataResponse,
  type FilterOptionValue,
} from './lib/api';
