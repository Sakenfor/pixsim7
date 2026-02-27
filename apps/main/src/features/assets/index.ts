/**
 * Assets Feature
 *
 * Asset management, browsing, selection, and local folder integration.
 */

// ============================================================================
// Components - Gallery Surfaces
// ============================================================================

export { CuratorSurfaceContent } from './components/CuratorGallerySurface';
export type { CuratorSurfaceContentProps } from './components/CuratorGallerySurface';
export { DebugSurfaceContent } from './components/DebugGallerySurface';
export type { DebugSurfaceContentProps } from './components/DebugGallerySurface';
export { ReviewSurfaceContent } from './components/ReviewGallerySurface';
export type { ReviewSurfaceContentProps } from './components/ReviewGallerySurface';
export { AssetDetailModal } from './components/AssetDetailModal';
export { DeleteAssetModal } from './components/DeleteAssetModal';
export { RelatedAssetsModal } from './components/RelatedAssetsModal';

// ============================================================================
// Components - Asset Sources & Panels
// ============================================================================

export { LocalFoldersPanel } from './components/LocalFoldersPanel';
export { LocalFoldersSource } from './components/LocalFoldersSource';
export { ProviderLibrarySource } from './components/ProviderLibrarySource';
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
export type { AssetsController } from './hooks/useAssetsController';

export { useAssetViewer, useViewerScopeSync } from './hooks/useAssetViewer';

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

export { useRelatedAssetsStore } from './stores/relatedAssetsStore';

export { useAssetSettingsStore } from './stores/assetSettingsStore';

export { useLocalFolderSettingsStore } from './stores/localFolderSettingsStore';

export { useDeleteModalStore } from './stores/deleteModalStore';

export {
  useAssetViewerStore,
  selectIsViewerOpen,
  selectCanNavigatePrev,
  selectCanNavigateNext,
  type NavigationScope,
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

export {
  useAssetSetStore,
  type AssetSet,
  type ManualAssetSet,
  type SmartAssetSet,
  type AssetSetKind,
} from './stores/assetSetStore';

export { resolveAssetSet, assetModelsToInputItems } from './lib/assetSetResolver';

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
  selectedAssetToViewer,
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

export {
  extractUploadError,
  resolveProviderLabel,
  notifyGalleryOfNewAsset,
  notifyGalleryOfUpdatedAsset,
} from './lib/uploadActions';

export { useQuickTagStore } from './lib/quickTagStore';
export { applyQuickTag } from './lib/quickTag';

export { useAssetContextMenu, useRegisterAssetContext } from './lib/assetContextResolver';

// ============================================================================
// Pickers - Shared asset picker primitives
// ============================================================================

export type { PickedAsset } from './components/pickers';
export { InlineAssetSearchPicker, type InlineAssetSearchPickerProps } from './components/pickers';
export { useGalleryAssetPicker, type GalleryAssetPickerOptions } from './components/pickers';
export { AssetPickerField, type AssetPickerFieldProps } from './components/pickers';

export {
  bulkDeleteAssets,
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
