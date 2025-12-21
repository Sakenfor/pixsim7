/**
 * Panel Registry System
 * Dynamic panel registration for workspace panels
 */

export {
  PanelRegistry,
  panelRegistry,
  type PanelDefinition,
  type WorkspaceContext,
  type CoreEditorRole,
  type ContextLabelStrategy,
} from "./panelRegistry";

export {
  PANEL_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type PanelCategory,
} from "./panelConstants";

export {
  type PanelPlugin,
  PanelPluginManager,
  pluginManager,
} from "./panelPlugin";
export { corePanelsPlugin } from "./corePanelsPlugin";
export { initializePanels } from "./initializePanels";
export { PanelHostLite } from "./PanelHostLite";

// Panel actions
export * from "./actions";

// Instance settings resolver
export {
  useResolvePanelSettings,
  useResolveComponentSettings,
  useResolveAllComponentSettings,
  getInstanceId,
  type ResolvedSettings,
} from "./instanceSettingsResolver";
