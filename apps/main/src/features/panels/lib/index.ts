/**
 * Panel Registry System
 * Dynamic panel registration for workspace panels
 */

// Unified panel types
export {
  type BasePanelDefinition,
  type PanelRegistryLike,
  type MutablePanelRegistryLike,
  type PanelAvailabilityPolicy,
  type PanelInstancePolicy,
} from "./panelTypes";

export { panelSelectors, dockWidgetSelectors } from "@lib/plugins/catalogSelectors";

export {
  PanelRegistry,
  panelRegistry,
  registerSimplePanel,
  getPanelsByTag,
  getPanelIdsByTag,
  getPanelsForScope,
  getPanelIdsForScope,
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
export { initializePanels } from "./initializePanels";
export { PanelHostLite } from "../components/host/PanelHostLite";

// Auto-discovery system
export {
  definePanel,
  getPanelContexts,
  panelBelongsToContext,
  type DefinePanelOptions,
  type PanelModule,
} from "./definePanel";

export {
  discoverPanels,
  autoRegisterPanels,
  getPanelsForContext,
  getPanelIdsForContext,
  type DiscoveredPanel,
  type AutoDiscoveryOptions,
  type DiscoveryResult,
} from "./autoDiscovery";

// Panel actions
export * from "./actions";

// Action adapters for converting canonical ActionDefinition to PanelAction
export { toPanelAction, toPanelActions, type ToPanelActionOptions } from "./actionAdapters";

// Instance settings resolver
export {
  resolveSettings,
  useResolvePanelSettings,
  useResolveComponentSettings,
  useResolveAllComponentSettings,
  getInstanceId,
  type ResolvedSettings,
} from "./instanceSettingsResolver";

// Dock widget registry (dockview containers)
export {
  dockWidgetRegistry,
  registerDockWidget,
  registerDefaultDockWidgets,
  getDockWidget,
  getDockWidgetByDockviewId,
  resolvePresetScope,
  getDockWidgetPanelIds,
  type DockWidgetDefinition,
  type PresetScope,
} from "./dockWidgetRegistry";

// Scope instance helpers
export {
  ScopeInstanceProvider,
} from "../components/scope/scopeContext";
export { useScopeInstanceId } from "../components/scope/scopeInstanceContext";

// ScopeHost for automatic scope provider wrapping
export { ScopeHost, type ScopeHostProps } from "../components/scope/ScopeHost";
