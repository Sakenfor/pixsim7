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
export { SignalTriageContent } from './components/SignalTriageGallerySurface';
export type { SignalTriageContentProps } from './components/SignalTriageGallerySurface';
export { AssetDetailModal } from './components/AssetDetailModal';
export { DeleteAssetModal } from './components/DeleteAssetModal';

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

export { useAssetSequence } from './hooks/useAssetSequence';
export type {
  AssetSequenceAxis,
  AssetSequenceFilters,
  UseAssetSequenceArgs,
  UseAssetSequenceReturn,
} from './hooks/useAssetSequence';

export { useAssetsController } from './hooks/useAssetsController';
export type { AssetsController } from './hooks/useAssetsController';

export { useAssetViewer, useViewerScopeSync } from './hooks/useAssetViewer';

export { useRecentScope } from './hooks/useRecentScope';

export { useHistoryScope } from './hooks/useHistoryScope';

export { useProbesScope } from './hooks/useProbesScope';

export { useAroundTimeScope } from './hooks/useAroundTimeScope';

export { useSamePromptScope } from './hooks/useSamePromptScope';

export { useSameFolderScope } from './hooks/useSameFolderScope';

export { useResolvedAssetSet } from './hooks/useResolvedAssetSet';
export type { UseResolvedAssetSetResult } from './hooks/useResolvedAssetSet';

export { FAVORITE_TAG_SLUG, isFavoriteAsset, toggleFavoriteTag, setFavoriteTag } from './lib/favoriteTag';

export { useFilterMetadata } from './hooks/useFilterMetadata';

export { useLocalFoldersController } from './hooks/useLocalFoldersController';

// ============================================================================
// Sources - AssetSource data-layer seam
// ============================================================================

export type {
  AssetSource,
  AssetSourceIdentity,
  AssetSourceCapabilities,
  AssetSourceFetchMode,
  AssetListQuery,
  AssetPage,
  AssetLibraryStatus,
  AssetIngestOptions,
  AssetIngestResult,
  AssetSourceFolders,
  AssetSourceLifecycle,
} from './sources/assetSource';

export { createLocalFolderSource, localFolderSource } from './sources/localFolderSource';
export { createRemoteAssetSource, remoteAssetSource } from './sources/remoteAssetSource';

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
  useAssetEngagementStore,
  useAssetEngagement,
  type AssetEngagement,
} from './stores/assetEngagementStore';

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
  /** @deprecated Use LocalAssetModel instead */
  type LocalAsset,
} from './stores/localFoldersStore';

export {
  type LocalAssetModel,
  type LocalFolderMeta,
  buildLocalAssetModel,
  isLocalAssetModel,
  hashStringToStableNegativeId,
} from './types/localFolderMeta';

export {
  useMediaSettingsStore,
  type ServerMediaSettings,
} from './stores/mediaSettingsStore';

export {
  useAssetSetStore,
  useAssetSets,
  type AssetSet,
  type ManualAssetSet,
  type SmartAssetSet,
  type AssetSetKind,
  type CreateAssetSetInput,
  type UseAssetSetsResult,
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

export {
  getAssetWarnings,
  hasWarning,
  type AssetWarning,
  type AssetWarningId,
  type AssetWarningSeverity,
} from './lib/assetWarnings';

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
  deleteAssetFromProvider,
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
