/**
 * Panels Feature Module
 *
 * Public API for the panels feature.
 * Exports panel registry, components, stores, and utilities for panel management.
 */

// Panel Orchestration System (declarative panel interactions)
export type {
  PanelType,
  WorkspaceZone,
  PanelMode,
  PanelMetadata,
  PanelState,
  ZoneState,
  PanelManagerState,
  OpenPanelOptions,
  MovePanelOptions,
  PanelManagerEvent,
  PanelManagerListener,
  PanelManagerStateListener,
} from './lib/types';
export { PanelManager, panelManager } from './lib/PanelManager';
export {
  getAllPanelMetadata,
  getPanelMetadataById,
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
export {
  usePanelIdentity,
  usePanelPersistedState,
  usePanelStateObject,
  type PanelStateScope,
  type PanelStateOptions,
} from './hooks/usePanelState';

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
  type PanelSettingsTab,
  type PanelSettingsFormSchema,
} from "./lib/panelRegistry";


export {
  usePanelSettingsHelpers,
  validateAndMigrateSettings,
} from "./lib/panelSettingsHelpers";

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
} from "./lib/dockWidgetRegistry";

export {
  PANEL_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type PanelCategory,
} from "./lib/panelConstants";
export {
  panelSettingsScopeRegistry,
  type PanelSettingsScopeDefinition,
  type PanelSettingsScopeMode,
  type ScopeMatchContext,
  createScopeMatcher,
  getScopeMode,
  type ScopeResolveContext,
  resolveScopeInstanceId,
  resolveCapabilityScopeFromScopeInstanceId,
} from "./lib/panelSettingsScopes";

export {
  type PanelPlugin,
  PanelPluginManager,
  pluginManager,
} from "./lib/panelPlugin";
export { initializePanels } from "./lib/initializePanels";
export { PanelHostLite } from "./components/host/PanelHostLite";
export { PanelHostDockview, type PanelHostDockviewRef } from "./components/host/PanelHostDockview";

// Panel actions
export * from "./lib/actions";

// Panel Components
export { PanelHeader } from "./components/shared/PanelHeader";
export { FloatingPanelsManager } from "./components/shared/FloatingPanelsManager";
export { SimplePanelBuilder } from "./components/shared/SimplePanelBuilder";
export { ScopeModeSelect } from "./components/shared/ScopeModeSelect";

// Panel Store
export {
  usePanelConfigStore,
  type PanelConfig,
  type PanelInstance,
  type PanelConfigState,
  type PanelConfigActions,
  type GalleryPanelSettings,
  type PanelRegistryOverride,
} from "./stores/panelConfigStore";
export {
  usePanelInstanceSettingsStore,
  type PanelInstanceSettings,
  type PanelInstanceSettingsState,
  type PanelInstanceSettingsActions,
} from "./stores/panelInstanceSettingsStore";
export {
  useModel3DStore,
  selectHasModel,
  selectIsInZoneMode,
  selectHasAnimations,
  selectZoneIds,
  selectSelectedZoneConfig,
} from "@features/scene3d/stores/model3DStore";

// Re-export lib index for convenience
export * from "./lib";
