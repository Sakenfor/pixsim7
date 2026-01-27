/**
 * Dock Zone Registry - Re-exported from shared package
 */
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
} from '@pixsim7/shared.ui.dockview';
export type { DockZoneDefinition, PresetScope } from '@pixsim7/shared.ui.dockview';
