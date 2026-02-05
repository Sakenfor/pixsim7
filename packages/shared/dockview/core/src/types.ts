/**
 * Core Dockview Types (Framework-Agnostic)
 *
 * These types define the basic contracts for dockview layouts,
 * panel positions, and configuration without any React dependencies.
 */

/**
 * Position hint for panel layout
 */
export interface PanelPosition {
  direction: 'left' | 'right' | 'above' | 'below' | 'within';
  referencePanel?: string;
}

/**
 * Size constraints for a panel
 */
export interface PanelSizeConstraints {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

/**
 * Initial size hints for a panel
 */
export interface PanelInitialSize {
  width?: number;
  height?: number;
}

/**
 * Basic panel definition (framework-agnostic)
 */
export interface BasePanelInfo {
  id: string;
  title?: string;
}

/**
 * Panel lookup interface for resolving panel metadata
 */
export interface PanelLookup {
  get(panelId: string): BasePanelInfo | undefined;
}

/**
 * Serializable layout definition
 */
export interface DockviewLayout {
  panels: Array<{
    id: string;
    position?: PanelPosition;
  }>;
}

/**
 * Configuration for layout persistence
 */
export interface LayoutPersistenceConfig {
  /** Storage key for persisting layout */
  storageKey: string;
  /** Storage backend (defaults to localStorage) */
  storage?: Storage;
}

/**
 * Preset scope type for layout presets
 */
export type PresetScope = string;

/**
 * Dock zone definition for dockview containers
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
