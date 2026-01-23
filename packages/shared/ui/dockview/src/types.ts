/**
 * Local Panel Registry Types
 *
 * Types for feature-scoped panel registries used with dockview.
 * Unlike global registries, these are lightweight and app-agnostic.
 */

import type { BasePanelDefinition } from "@pixsim7/shared.ui.panels";

// Re-export for convenience
export type { BasePanelDefinition, PanelRegistryLike } from "@pixsim7/shared.ui.panels";

/**
 * Position hint for default panel layout
 */
export interface PanelPosition {
  direction: "left" | "right" | "above" | "below" | "within";
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
 * Definition for a local/feature-scoped panel.
 * Extends BasePanelDefinition with layout-specific fields.
 */
export interface LocalPanelDefinition<TParams = any> extends BasePanelDefinition<TParams> {
  /** Default position when creating layout */
  defaultPosition?: PanelPosition;
  /** Size constraints */
  size?: PanelSizeConstraints;
  /** Whether this panel can be closed by the user */
  closable?: boolean;
}

/**
 * Configuration for SmartDockview
 */
export interface SmartDockviewConfig {
  /** Storage key for persisting layout */
  storageKey?: string;
  /** Minimum panels in a group to show tabs (default: 2) */
  minPanelsForTabs?: number;
  /** Default layout to use when no saved layout exists */
  defaultLayout?: SmartDockviewLayout;
  /** Class name for the container */
  className?: string;
}

/**
 * Serializable layout definition
 */
export interface SmartDockviewLayout {
  /** Panel IDs and their positions */
  panels: Array<{
    id: string;
    position?: PanelPosition;
  }>;
}

/**
 * Context passed to panel components
 */
export interface SmartDockviewPanelProps<TContext = any> {
  /** Shared context from parent */
  context: TContext;
  /** Panel's own ID */
  panelId: string;
}
