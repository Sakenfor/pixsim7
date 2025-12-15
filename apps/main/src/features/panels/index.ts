/**
 * Panels Feature Module
 *
 * Public API for the panels feature.
 * Exports panel registry, components, stores, and utilities for panel management.
 */

// Panel Registry System
export {
  PanelRegistry,
  panelRegistry,
  type PanelDefinition,
  type WorkspaceContext,
  type CoreEditorRole,
  type ContextLabelStrategy,
} from "./lib/panelRegistry";

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
