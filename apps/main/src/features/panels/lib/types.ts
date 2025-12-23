/**
 * Panel System Types
 *
 * Declarative panel orchestration system that coordinates workspace panels,
 * zones, and internal dockview layouts.
 */

import type { DockviewApi } from 'dockview-core';
import type { DockviewHost } from '@lib/dockview';

/**
 * Actions that can be taken on a panel in response to other panel events
 */
export type PanelAction =
  | 'retract'     // Collapse to icon/thin bar
  | 'hide'        // Completely hidden
  | 'minimize'    // Minimize but show in taskbar/tab
  | 'share'       // Share space (split)
  | 'nothing'     // No change
  | 'expand'      // Restore to normal size
  | 'restore'     // Restore previous state
  | 'show';       // Show if hidden

/**
 * Panel type - determines how panel behaves in workspace
 */
export type PanelType =
  | 'zone-panel'          // Simple panel in a zone (no dockview)
  | 'dockview-container'  // Panel that contains a dockview instance
  | 'dockview-subpanel';  // Sub-panel within a dockview (managed by parent)

/**
 * Workspace zones where panels can be placed
 */
export type WorkspaceZone =
  | 'left'
  | 'right'
  | 'center'
  | 'bottom'
  | 'top'
  | 'floating';

/**
 * Panel display mode
 */
export type PanelMode =
  | 'normal'      // Full size, visible
  | 'retracted'   // Collapsed to icon/thin bar
  | 'minimized'   // Minimized but accessible via tab/taskbar
  | 'hidden';     // Completely hidden

/**
 * Panel metadata - declarative configuration for a panel
 */
export interface PanelMetadata {
  /** Unique panel identifier */
  id: string;

  /** Display title */
  title: string;

  /** Panel type - determines behavior */
  type: PanelType;

  /** Parent panel ID (for sub-panels) */
  parentId?: string;

  /** Default workspace zone */
  defaultZone?: WorkspaceZone;

  /** Can user drag panel to different zone? */
  canChangeZone?: boolean;

  /** Retraction configuration */
  retraction?: {
    /** Can this panel be retracted? */
    canRetract?: boolean;
    /** Width when retracted (px) */
    retractedWidth?: number;
    /** Height when retracted (px) */
    retractedHeight?: number;
    /** Animation duration (ms) */
    animationDuration?: number;
  };

  /** Dockview integration (for container panels) */
  dockview?: {
    /** This panel uses dockview internally */
    hasDockview: boolean;
    /** ID of the sub-panel registry */
    subPanelRegistry?: string;
    /** Can sub-panels pop out to floating windows? */
    subPanelsCanBreakout?: boolean;
    /** Persist dockview layout to localStorage? */
    persistLayout?: boolean;
    /** Storage key for layout persistence */
    storageKey?: string;
  };

  /** Priority for space conflicts (0-100, default 50, higher = more important) */
  priority?: number;

  /** Interaction rules - what happens when other panels open/close */
  interactionRules?: {
    /** Actions to take when specified panels open */
    whenOpens?: Record<string, PanelAction>;
    /** Actions to take when specified panels close */
    whenCloses?: Record<string, PanelAction>;
  };
}

/**
 * Runtime state of a panel
 */
export interface PanelState {
  /** Panel ID */
  id: string;

  /** Is panel currently open? */
  isOpen: boolean;

  /** Current display mode */
  mode: PanelMode;

  /** Current zone */
  zone: WorkspaceZone;

  /** Dimensions when retracted */
  retractedDimensions?: {
    width: number;
    height: number;
  };

  /** Dockview state (if applicable) */
  dockview?: {
    /** Is dockview API ready? */
    isReady: boolean;
    /** Dockview API instance */
    api?: DockviewApi;
    /** Dockview host (preferred over api) */
    host?: DockviewHost;
    /** Sub-panel states */
    subPanelStates?: Map<string, {
      isActive: boolean;
      isVisible: boolean;
    }>;
  };
}

/**
 * Runtime state of a workspace zone
 */
export interface ZoneState {
  /** Zone ID */
  id: WorkspaceZone;

  /** Panel IDs in this zone (order matters) */
  panels: string[];

  /** Currently active/focused panel in zone */
  activePanel?: string;
}

/**
 * Complete panel manager state
 */
export interface PanelManagerState {
  /** All panel states */
  panels: Map<string, PanelState>;

  /** All zone states */
  zones: Map<WorkspaceZone, ZoneState>;

  /** Timestamp of last update */
  lastUpdate: number;
}

/**
 * Options for opening a panel
 */
export interface OpenPanelOptions {
  /** Override default zone */
  zone?: WorkspaceZone;

  /** Skip interaction rules */
  skipRules?: boolean;

  /** Animation duration override (ms) */
  animationDuration?: number;
}

/**
 * Options for moving a panel to a different zone
 */
export interface MovePanelOptions {
  /** Target zone */
  toZone: WorkspaceZone;

  /** Position in zone (index) */
  position?: number;

  /** Make active after move */
  makeActive?: boolean;
}

/**
 * Panel manager event types
 */
export type PanelManagerEvent =
  | { type: 'panel:opened'; panelId: string }
  | { type: 'panel:closed'; panelId: string }
  | { type: 'panel:retracted'; panelId: string }
  | { type: 'panel:expanded'; panelId: string }
  | { type: 'panel:moved'; panelId: string; fromZone: WorkspaceZone; toZone: WorkspaceZone }
  | { type: 'panel:focused'; panelId: string }
  | { type: 'dockview:registered'; panelId: string }
  | { type: 'subpanel:breakout'; parentId: string; subPanelId: string }
  | { type: 'state:changed' };

/**
 * Panel manager event listener
 */
export type PanelManagerListener = (event: PanelManagerEvent) => void;

/**
 * Panel manager state listener
 */
export type PanelManagerStateListener = (state: PanelManagerState) => void;
