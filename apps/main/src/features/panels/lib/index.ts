/**
 * Panel Registry System
 * Dynamic panel registration for workspace panels
 */

// Unified panel types
export {
  type BasePanelDefinition,
  type PanelRegistryLike,
  type MutablePanelRegistryLike,
} from "./panelTypes";

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

// Instance settings resolver
export {
  resolveSettings,
  useResolvePanelSettings,
  useResolveComponentSettings,
  useResolveAllComponentSettings,
  getInstanceId,
  type ResolvedSettings,
} from "./instanceSettingsResolver";

// Scope provider registry (automatic scope injection)
export {
  scopeProviderRegistry,
  createScopeMatcher,
  type ScopeProviderDefinition,
  type ScopeMatchContext,
} from "./scopeProviderRegistry";
