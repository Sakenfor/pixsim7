/**
 * Local Panel Registry Types
 *
 * Types for feature-scoped panel registries used with SmartDockview.
 * Unlike the global workspace PanelRegistry, these are lightweight
 * registries for feature-internal panels (e.g., AssetViewer's panels).
 */

import type { ComponentType } from 'react';

/**
 * Position hint for default panel layout
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
 * Definition for a local/feature-scoped panel
 */
export interface LocalPanelDefinition<TParams = any> {
  /** Unique panel ID within this registry */
  id: string;
  /** Display title (shown in tabs when visible) */
  title: string;
  /** React component to render */
  component: ComponentType<TParams>;
  /** Icon name for tab/header */
  icon?: string;
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
