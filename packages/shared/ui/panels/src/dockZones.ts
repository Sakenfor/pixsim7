// Dock zone contract types

/**
 * Preset scope type - can be extended by features.
 */
export type PresetScope = string;

/**
 * Dock zone definition for dockview containers.
 * Describes a dockview's metadata for presets and panel filtering.
 */
export interface DockZoneDefinition {
  /** Stable zone ID (used for presets and settings) */
  id: string;
  /** Human-friendly label */
  label: string;
  /** Dockview ID (panelManagerId / currentDockviewId) */
  dockviewId: string;
  /** Preset scope to use for layout presets */
  presetScope: PresetScope;
  /** Panel scope for auto-filtering panels */
  panelScope?: string;
  /** Optional explicit allowlist of panels */
  allowedPanels?: string[];
  /** Optional default panels for initial layouts */
  defaultPanels?: string[];
  /** Optional storage key for layout persistence */
  storageKey?: string;
  /** Optional description */
  description?: string;
}
