/**
 * @pixsim7/shared.dockview.core
 *
 * Framework-agnostic dockview utilities.
 * Can be used with vanilla JS, React, or any other framework.
 *
 * Re-exports dockview-core for convenience.
 */

// Re-export dockview-core
export { DockviewComponent } from 'dockview-core';
export type {
  DockviewApi,
  DockviewComponentOptions,
  IDockviewPanel,
  IContentRenderer,
  SerializedDockview,
  DockviewPanelApi,
  AddPanelOptions as DockviewAddPanelOptions,
} from 'dockview-core';

// Types
export type {
  PanelPosition,
  PanelSizeConstraints,
  PanelInitialSize,
  BasePanelInfo,
  PanelLookup,
  DockviewLayout,
  LayoutPersistenceConfig,
  PresetScope,
  DockZoneDefinition,
} from './types';

// Panel lookup configuration
export { configurePanelLookup } from './types';

// Panel utilities
export {
  getPanels,
  getGroups,
  getGroupCount,
  resolvePanelDefinitionId,
  findPanel,
  findAllPanels,
  isPanelOpen,
  focusPanel,
  addPanel,
  removePanel,
  togglePanel,
  ensurePanels,
} from './panelUtils';
export type { AddPanelOptions, EnsurePanelsOptions } from './panelUtils';

// Layout persistence
export {
  saveLayout,
  loadLayout,
  clearLayout,
  hasLayout,
  createDebouncedSave,
  setupAutoSave,
} from './layoutPersistence';
export type { LayoutStorage } from './layoutPersistence';

// Safe API wrapper
export { createSafeApi } from './safeDockviewApi';
export type { SafeDockviewApi } from './safeDockviewApi';

// Host
export { createDockviewHost } from './host';
export type { DockviewHost } from './host';

// Host registry
export {
  subscribeToDockviewRegistry,
  registerDockviewHost,
  unregisterDockviewHost,
  getDockviewHost,
  getDockviewApi,
  getDockviewCapabilities,
  getDockviewRegistration,
  getDockviewHostIds,
  getAllDockviewHosts,
  hasDockviewHost,
  clearDockviewRegistry,
} from './hostRegistry';
export type { DockviewCapabilities, DockviewRegistration } from './hostRegistry';

// Dockview resolution utilities
export { resolveDockview, resolveDockviewHost, resolveDockviewApi } from './resolveDockview';
export type { ResolveDockviewResult } from './resolveDockview';

// Dock zone registry
export {
  dockZoneRegistry,
  registerDockZone,
  unregisterDockZone,
  getDockZone,
  getDockZoneByDockviewId,
  setDefaultPresetScope,
  getDefaultPresetScope,
  resolvePresetScope,
  getDockZonePanelIds,
  DEFAULT_DOCK_ZONES,
  registerDefaultDockZones,
  areDefaultZonesRegistered,
} from './dockZoneRegistry';
