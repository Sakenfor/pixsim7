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

// Shared utilities (re-exported from shared packages)
export {
  LocalPanelRegistry,
  createLocalPanelRegistry,
  configurePanelLookup,
  useSmartDockview,
  useDockviewIds,
  createSafeApi,
  createDockviewHost,
  resolveDockview,
  resolveDockviewApi,
  resolveDockviewHost,
  addDockviewPanel,
  ensurePanels,
  getDockviewGroupCount,
  getDockviewGroups,
  getDockviewPanels,
  findDockviewPanel,
  focusPanel,
  isPanelOpen,
  resolvePanelDefinitionId,
  getDockviewHost,
  getDockviewHostIds,
  getDockviewApi,
  getDockviewCapabilities,
  getDockviewRegistration,
  getAllDockviewHosts,
  registerDockviewHost,
  unregisterDockviewHost,
  subscribeToDockviewRegistry,
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

export type {
  UseSmartDockviewOptions,
  UseSmartDockviewReturn,
  DockviewIds,
  SafeDockviewApi,
  DockviewHost,
  ResolveDockviewResult,
  AddDockviewPanelOptions,
  EnsurePanelsOptions,
  DockviewCapabilities,
  DockviewRegistration,
  DockZoneDefinition,
  PresetScope,
  LocalPanelDefinition,
  PanelPosition,
  PanelSizeConstraints,
  SmartDockviewConfig,
  SmartDockviewLayout,
  SmartDockviewPanelProps,
} from '@pixsim7/shared.ui.dockview';

// Context menu system
export * from './contextMenu';
export * from './floatingPanelInterop';
