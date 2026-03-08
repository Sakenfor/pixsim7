// Backward-compatible barrel: all existing imports from './types' keep working.
export type {
  PluginManifest,
  PluginPermission,
  PluginState,
  PluginEntry,
  PluginGameState,
  PluginOverlay,
  PluginMenuItem,
  PluginNotification,
  PluginAPI,
  Plugin,
  PluginBundle,
} from './bundleApi';

export type {
  UnifiedPluginOrigin,
  UnifiedPluginFamily,
  SceneViewExtension,
  ControlCenterExtension,
  DockWidgetExtension,
  WorkspacePanelExtension,
  GizmoSurfaceExtension,
  FamilyExtensions,
  UnifiedPluginCapabilities,
  UnifiedPluginDescriptor,
} from './descriptor';

export {
  normalizeOrigin,
  BUNDLE_FAMILIES,
  isBundleFamily,
  bundleFamilyToUnified,
  unifiedFamilyToBundleFamily,
} from './normalization';
export type { BundleFamily } from './normalization';

export { fromPluginSystemMetadata } from './converters';

export { validateFamilyMetadata } from './validation';
export type { FamilyValidationResult } from './validation';
