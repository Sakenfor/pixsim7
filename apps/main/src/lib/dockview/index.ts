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

export { LocalPanelRegistry, createLocalPanelRegistry } from './LocalPanelRegistry';

export { useSmartDockview } from './useSmartDockview';
export type { UseSmartDockviewOptions, UseSmartDockviewReturn } from './useSmartDockview';

export {
  addDockviewPanel,
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
  // Backward compatibility aliases
  dockviewWidgetRegistry,
  registerDockviewWidget,
  unregisterDockviewWidget,
  getDockviewWidget,
  getDockviewWidgetByDockviewId,
  getDockviewWidgetPanelIds,
  registerDefaultDockviewWidgets,
  areDefaultWidgetsRegistered,
  DEFAULT_DOCKVIEW_WIDGETS,
} from './dockZoneRegistry';
export type {
  DockZoneDefinition,
  PresetScope,
  // Backward compatibility alias
  DockviewWidgetDefinition,
} from './dockZoneRegistry';

export type {
  LocalPanelDefinition,
  PanelPosition,
  PanelSizeConstraints,
  SmartDockviewConfig,
  SmartDockviewLayout,
  SmartDockviewPanelProps,
} from './types';
