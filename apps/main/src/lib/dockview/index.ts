/**
 * Smart Dockview
 *
 * Lightweight dockview infrastructure with:
 * - Local (feature-scoped) panel registries
 * - Smart tab visibility (tabs shown only when 2+ panels grouped)
 * - Layout persistence
 * - Minimal chrome styling
 */

export { SmartDockview } from './SmartDockview';
export type { SmartDockviewProps } from './SmartDockview';

export { LocalPanelRegistry, createLocalPanelRegistry } from '@pixsim7/shared.ui.dockview';

export { useSmartDockview } from '@pixsim7/shared.ui.dockview';
export type { UseSmartDockviewOptions, UseSmartDockviewReturn } from '@pixsim7/shared.ui.dockview';

export { useDockviewIds } from './useDockviewIds';
export type { DockviewIds } from './useDockviewIds';
export { resolveDockview, resolveDockviewApi, resolveDockviewHost } from './resolveDockview';

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

// Context menu system
export * from './contextMenu';

// Dock Zone Registry (dockview container definitions)
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

export type {
  LocalPanelDefinition,
  PanelPosition,
  PanelSizeConstraints,
  SmartDockviewConfig,
  SmartDockviewLayout,
  SmartDockviewPanelProps,
} from '@pixsim7/shared.ui.dockview';
