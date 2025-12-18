/**
 * Panels Feature Module
 *
 * Public API for the panels feature.
 * Exports panel registry, components, stores, and utilities for panel management.
 */

// Panel Orchestration System (declarative panel interactions)
export type * from './lib/types';
export { PanelManager, panelManager } from './lib/PanelManager';
export {
  CONTROL_CENTER_METADATA,
  ASSET_VIEWER_METADATA,
  GALLERY_METADATA,
  GRAPH_METADATA,
  ALL_PANEL_METADATA,
  PANEL_METADATA_BY_ID,
  registerAllPanels,
  reloadPanelsWithSettings,
} from './lib/panelMetadataRegistry';
export {
  usePanelState,
  useZoneState,
  usePanelsInZone,
  useActivePanelInZone,
  useOpenPanels,
  usePanelManagerState,
  usePanelManagerEvents,
  usePanelActions,
  usePanel,
  useZoneActions,
  usePanelIs,
  usePanelManagerInstance,
} from './hooks/usePanelManager';
export {
  usePanelSystemInitialization,
  useInitializePanelSystem,
} from './hooks/usePanelSystemInitialization';

// Panel Registry System
export {
  PanelRegistry,
  panelRegistry,
  type PanelDefinition,
  type WorkspaceContext,
  type CoreEditorRole,
  type ContextLabelStrategy,
  type PanelSettingsProps,
  type PanelSettingsUpdateHelpers,
  type PanelSettingsSection,
} from "./lib/panelRegistry";

export {
  usePanelSettingsHelpers,
  validateAndMigrateSettings,
} from "./lib/panelSettingsHelpers";

export {
  PANEL_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type PanelCategory,
} from "./lib/panelConstants";

export {
  type PanelPlugin,
  PanelPluginManager,
  pluginManager,
} from "./lib/panelPlugin";
export { corePanelsPlugin } from "./lib/corePanelsPlugin";
export { initializePanels } from "./lib/initializePanels";
export { PanelHostLite } from "./lib/PanelHostLite";

// Panel actions
export * from "./lib/actions";

// Panel Components
export { PanelHeader } from "./components/shared/PanelHeader";
export { FloatingPanelsManager } from "./components/shared/FloatingPanelsManager";
export { SimplePanelBuilder } from "./components/shared/SimplePanelBuilder";

// Panel Store
export {
  usePanelConfigStore,
  type PanelConfig,
  type PanelInstance,
  type PanelConfigState,
  type PanelConfigActions,
  type GalleryPanelSettings,
} from "./stores/panelConfigStore";

// Re-export lib index for convenience
export * from "./lib";
