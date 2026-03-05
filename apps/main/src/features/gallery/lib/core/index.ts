/**
 * Gallery Library Exports
 */

// Gallery tool types
export type {
  GalleryToolCategory,
  GalleryAsset,
  GalleryToolContext,
  GalleryToolPlugin,
  GalleryUiToolPlugin,
} from './types';
export {
  GalleryToolRegistry,
  galleryToolRegistry,
} from './types';

// Gallery surface types
export type {
  GallerySurfaceId,
  GallerySurfaceCategory,
  MediaType,
  GallerySurfaceDefinition,
} from './surfaceRegistry';
export {
  GallerySurfaceRegistry,
  gallerySurfaceRegistry,
} from './surfaceRegistry';

// Gallery surface registration
export { registerGallerySurfaces } from './registerGallerySurfaces';

// Gallery tools registration
export { registerGalleryTools } from './registerGalleryTools';

// Asset roles and tag utilities (Task 99.1)
export type {
  AssetCharacterId,
  AssetLocationId,
  AssetRole,
} from './assetRoles';
export {
  getAssetRoles,
  getAssetCharacters,
  getAssetLocations,
  hasAssetRole,
  hasAssetCharacter,
  hasAssetLocation,
  getAssetCameraTags,
  getAssetIdentities,
  filterAssetsByRole,
  filterAssetsByCharacter,
  filterAssetsByLocation,
  filterAssetsByRoleAndIdentity,
  inferCompositionRoleFromAsset,
} from './assetRoles';

// Asset sources (order matters for initialization)
export type {
  SourceTypeId,
  SourceCategory,
  SourceTypeDefinition,
} from './sourceTypes';
export {
  sourceTypeRegistry,
  registerSourceType,
  getSourceType,
  getAllSourceTypes,
  getDefaultInstanceId,
} from './sourceTypes';
export type {
  AssetSourceId,
  AssetSourceInfo,
  AssetSourceComponentProps,
  AssetSourceDefinition,
} from './assetSources';
export {
  assetSourceRegistry,
  registerAssetSource,
  getAssetSource,
  getAllAssetSources,
} from './assetSources';
export { registerAssetSources } from './registerAssetSources';

// Badge config utilities
export {
  mergeBadgeConfig,
  deriveOverlayPresetIdFromBadgeConfig,
} from './badgeConfigMerge';
