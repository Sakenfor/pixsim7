export { SmartDockviewBase } from './SmartDockviewBase';
export type {
  SmartDockviewBaseProps,
  SmartDockviewLayoutController,
} from './SmartDockviewBase';

export { LocalPanelRegistry, createLocalPanelRegistry } from './LocalPanelRegistry';

export { useSmartDockview } from './useSmartDockview';
export type { UseSmartDockviewOptions, UseSmartDockviewReturn } from './useSmartDockview';

export type {
  LocalPanelDefinition,
  PanelPosition,
  PanelSizeConstraints,
  SmartDockviewConfig,
  SmartDockviewLayout,
  SmartDockviewPanelProps,
} from './types';

// Host infrastructure
export type { PanelLookup } from './hostTypes';
export {
  addDockviewPanel,
  ensurePanels,
  getDockviewGroupCount,
  getDockviewGroups,
  getDockviewPanels,
  findDockviewPanel,
  focusPanel,
  isPanelOpen,
  resolvePanelDefinitionId,
} from './panelAdd';
export type { AddDockviewPanelOptions, EnsurePanelsOptions } from './panelAdd';

export { createDockviewHost } from './host';
export type { DockviewHost } from './host';

export {
  getDockviewHost,
  getDockviewHostIds,
  getDockviewApi,
  getDockviewCapabilities,
  getDockviewRegistration,
  getAllDockviewHosts,
  registerDockviewHost,
  unregisterDockviewHost,
  subscribeToDockviewRegistry,
} from './hostRegistry';
export type { DockviewCapabilities, DockviewRegistration } from './hostRegistry';

export { useDockviewIds } from './useDockviewIds';
export type { DockviewIds } from './useDockviewIds';

export {
  dockZoneRegistry,
  registerDockZone,
  unregisterDockZone,
  getDockZone,
  getDockZoneByDockviewId,
  resolvePresetScope,
  setDefaultPresetScope,
  getDefaultPresetScope,
  getDockZonePanelIds,
  registerDefaultDockZones,
  areDefaultZonesRegistered,
  DEFAULT_DOCK_ZONES,
} from './dockZoneRegistry';
export type { DockZoneDefinition, PresetScope } from './dockZoneRegistry';
