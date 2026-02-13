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
export { DeleteAssetModal } from './components/DeleteAssetModal';

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

export { useFavoriteToggle, FAVORITE_TAG_SLUG, toggleFavoriteTag } from './hooks/useFavoriteToggle';

export { useFilterMetadata } from './hooks/useFilterMetadata';

export { useLocalFoldersController } from './hooks/useLocalFoldersController';

// ============================================================================
// Context - Source Controller
// ============================================================================

export {
  SourceControllerProvider,
  useSourceController,
  useSourceControllerOptional,
  useSourceControllerType,
  useFolderSourceController,
  useCloudSourceController,
  useImportSourceController,
  // Re-export type guards for convenience
  isFolderController,
  isCloudController,
  isImportController,
  hasFolderCapability,
  hasAuthCapability,
  hasUploadCapability,
  hasPreviewCapability,
  hasViewerCapability,
  hasViewModeCapability,
  hasScanningCapability,
  hasFeatureFlagsCapability,
} from './context/SourceControllerContext';

// ============================================================================
// Stores
// ============================================================================

export { useAssetPickerStore } from './stores/assetPickerStore';

export { useAssetSelectionStore } from './stores/assetSelectionStore';
export type { SelectedAsset } from './stores/assetSelectionStore';

export { useAssetDetailStore } from './stores/assetDetailStore';

export { useAssetSettingsStore } from './stores/assetSettingsStore';

export { useLocalFolderSettingsStore } from './stores/localFolderSettingsStore';

export { useDeleteModalStore } from './stores/deleteModalStore';

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

export { createAssetActions, type MinimalAsset } from '@pixsim7/shared.assets.core';

// ============================================================================
// Models - Internal Asset Types
// ============================================================================

export {
  fromAssetResponse,
  fromAssetResponses,
  getAssetDisplayUrls,
  toViewerAsset,
  toViewerAssets,
  toSelectedAsset,
  type AssetSyncStatus,
  type AssetProviderStatus,
  type TagSummary,
} from './models/asset';
// Note: AssetModel is re-exported via useAssets hook above

// ============================================================================
// Lib - Asset Media Type
// ============================================================================

export { resolveMediaType, resolveMediaTypes } from '@pixsim7/shared.assets.core';

// ============================================================================
// Lib - Asset Events
// ============================================================================

export { assetEvents } from './lib/assetEvents';

export { useQuickTagStore } from './lib/quickTagStore';
export { applyQuickTag } from './lib/quickTag';

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
