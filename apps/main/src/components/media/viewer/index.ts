/**
 * Asset Viewer Module
 *
 * Dockview-based asset viewer with customizable panels.
 */

export {
  MediaPanel,
  QuickGeneratePanel,
  MetadataPanel,
  RegionAnnotationOverlay,
  RegionEditForm,
  RegionList,
} from './panels';
export type { ViewerSettings, ViewerPanelContext } from './types';
export {
  CAP_REGION_ANNOTATIONS,
  useHasRegionAnnotations,
  useProvideRegionAnnotations,
  useRegionAnnotations,
} from './capabilities';
export type { RegionAnnotationsCapability } from './capabilities';

// Re-export stores from feature module
export {
  useAssetRegionStore,
  useCaptureRegionStore,
  selectSelectedRegionId,
  selectDrawingMode,
  useAssetViewerOverlayStore,
  selectOverlayMode,
} from '@features/mediaViewer';
export type {
  AssetRegion,
  AssetRegionLayer,
  ExportedRegion,
  AssetRegionStoreHook,
  AssetViewerOverlayMode,
} from '@features/mediaViewer';
export { AssetViewerDockview } from './AssetViewerDockview';
export type { AssetViewerDockviewProps } from './AssetViewerDockview';
