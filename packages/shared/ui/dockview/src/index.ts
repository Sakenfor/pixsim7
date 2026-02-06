/**
 * @pixsim7/shared.ui.dockview
 *
 * React-specific dockview components and utilities.
 * Re-exports framework-agnostic utilities from @pixsim7/shared.dockview.core.
 */

// ===== React Components & Hooks =====
export { SmartDockviewBase } from './SmartDockviewBase';
export type {
  SmartDockviewBaseProps,
  SmartDockviewLayoutController,
} from './SmartDockviewBase';

export { LocalPanelRegistry, createLocalPanelRegistry } from './LocalPanelRegistry';

export { useSmartDockview } from './useSmartDockview';
export type { UseSmartDockviewOptions, UseSmartDockviewReturn } from './useSmartDockview';

export { useDockviewIds } from './useDockviewIds';
export type { DockviewIds } from './useDockviewIds';

// Local types (React-specific panel definitions)
export type {
  LocalPanelDefinition,
  SmartDockviewConfig,
  SmartDockviewLayout,
  SmartDockviewPanelProps,
} from './types';
// Re-export PanelPosition and PanelSizeConstraints from types for backward compatibility
export type { PanelPosition, PanelSizeConstraints } from './types';

// Drag-to-dock utilities
export { useDragToDock } from './useDragToDock';
export type { UseDragToDockOptions, UseDragToDockReturn, DropZone } from './useDragToDock';
export { DropZoneOverlay } from './DropZoneOverlay';
export type { DropZoneOverlayProps } from './DropZoneOverlay';

// ===== Re-exports from Core (Framework-Agnostic) =====
// These are re-exported for backward compatibility with existing imports

// Panel utilities (with backward-compatible aliases)
export {
  getPanels as getDockviewPanels,
  getGroups as getDockviewGroups,
  getGroupCount as getDockviewGroupCount,
  resolvePanelDefinitionId,
  findPanel as findDockviewPanel,
  isPanelOpen,
  focusPanel,
  addPanel as addDockviewPanel,
  ensurePanels,
} from '@pixsim7/shared.dockview.core';
export type {
  AddPanelOptions as AddDockviewPanelOptions,
  EnsurePanelsOptions,
} from '@pixsim7/shared.dockview.core';

// Host
export { createDockviewHost } from '@pixsim7/shared.dockview.core';
export type { DockviewHost } from '@pixsim7/shared.dockview.core';

// Host registry
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
} from '@pixsim7/shared.dockview.core';
export type { DockviewCapabilities, DockviewRegistration } from '@pixsim7/shared.dockview.core';

// Dock zone registry
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
} from '@pixsim7/shared.dockview.core';
export type { DockZoneDefinition, PresetScope, PanelLookup } from '@pixsim7/shared.dockview.core';

// Layout persistence (new exports from core)
export {
  saveLayout,
  loadLayout,
  clearLayout,
  hasLayout,
  createDebouncedSave,
  setupAutoSave,
} from '@pixsim7/shared.dockview.core';
export type { LayoutStorage } from '@pixsim7/shared.dockview.core';
