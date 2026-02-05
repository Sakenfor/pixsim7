/**
 * Dockview Host (Framework-Agnostic)
 *
 * A host wraps a DockviewApi with convenience methods for panel operations.
 */

import type { DockviewApi } from 'dockview-core';
import type { PanelLookup } from './types';
import { addPanel, focusPanel, isPanelOpen, togglePanel, removePanel } from './panelUtils';
import type { AddPanelOptions } from './panelUtils';

export interface DockviewHost {
  /** Unique identifier for this dockview instance */
  dockviewId: string;
  /** The underlying dockview API */
  api: DockviewApi;
  /** Add a panel to this dockview */
  addPanel: (panelId: string, options?: AddPanelOptions) => string | null;
  /** Remove a panel from this dockview */
  removePanel: (panelId: string) => boolean;
  /** Toggle a panel (show/hide) */
  togglePanel: (panelId: string, options?: AddPanelOptions) => boolean;
  /** Check if a panel is open */
  isPanelOpen: (panelId: string, allowMultiple?: boolean) => boolean;
  /** Focus an existing panel */
  focusPanel: (panelId: string) => boolean;
}

/**
 * Create a DockviewHost wrapper for a dockview API
 */
export function createDockviewHost(
  dockviewId: string,
  api: DockviewApi,
  panelLookup?: PanelLookup,
): DockviewHost {
  return {
    dockviewId,
    api,
    addPanel: (panelId, options) => addPanel(api, panelId, options, panelLookup),
    removePanel: (panelId) => removePanel(api, panelId),
    togglePanel: (panelId, options) => togglePanel(api, panelId, options, panelLookup),
    isPanelOpen: (panelId, allowMultiple = false) => isPanelOpen(api, panelId, allowMultiple),
    focusPanel: (panelId) => focusPanel(api, panelId),
  };
}
