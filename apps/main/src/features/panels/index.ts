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
  ensurePanelMetadataRegistered,
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
  usePanelManagerActions,
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
  usePanelCatalogBootstrap,
  type UsePanelCatalogBootstrapOptions,
  type UsePanelCatalogBootstrapResult,
} from "./hooks/usePanelCatalogBootstrap";

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
  PANEL_IDS,
  DOCK_IDS,
  type PanelId,
  type DockId,
} from "./lib/panelIds";
export {
  panelSettingsScopeRegistry,
  GENERATION_SCOPE_ID,
  PREVIEW_SCOPE_ID,
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
export { PanelHostDockview, type PanelHostDockviewRef, type LayoutSpecEntry } from "./components/host/PanelHostDockview";

// Panel actions
export type {
  PanelActionError,
  PanelAction,
  PanelActionsConfig,
} from "./lib/actions";
export {
  panelActionRegistry,
  usePanelRegistryActions,
} from "./lib/actions";

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
  type GalleryClusterBy,
  type GalleryGroupBy,
  type GalleryGroupBySelection,
  type GalleryGroupMode,
  type GalleryGroupView,
  type GalleryGroupScope,
  type GalleryGroupMultiLayout,
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

// Explicit re-exports from lib/index.ts (replaces wildcard export)
export {
  panelSelectors,
  dockWidgetSelectors,
  registerSimplePanel,
  getPanelsByTag,
  getPanelIdsByTag,
  getPanelsForScope,
  getPanelIdsForScope,
  definePanel,
  getPanelContexts,
  panelBelongsToContext,
  resolveSiblings,
  filterOpenSiblings,
  toPanelAction,
  toPanelActions,
  resolveSettings,
  useResolvePanelSettings,
  useResolveComponentSettings,
  useResolveAllComponentSettings,
  getInstanceId,
  ScopeInstanceProvider,
  useScopeInstanceId,
  ScopeHost,
  SuppressScopeWrapping,
} from "./lib";
export type {
  BasePanelDefinition,
  PanelRegistryLike,
  MutablePanelRegistryLike,
  PanelAvailabilityPolicy,
  PanelInstancePolicy,
  DefinePanelOptions,
  PanelModule,
  SiblingCandidate,
  ToPanelActionOptions,
  ResolvedSettings,
  ScopeHostProps,
} from "./lib";
