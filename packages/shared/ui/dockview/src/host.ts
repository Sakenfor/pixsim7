/**
 * Dockview Host - shared, app-agnostic host factory
 */

import type { DockviewApi } from 'dockview-core';
import type { AddDockviewPanelOptions } from './panelAdd';
import { addDockviewPanel, focusPanel, isPanelOpen } from './panelAdd';
import type { PanelLookup } from './hostTypes';

export interface DockviewHost {
  dockviewId: string;
  api: DockviewApi;
  addPanel: (panelId: string, options?: AddDockviewPanelOptions) => string | null;
  isPanelOpen: (panelId: string, allowMultiple?: boolean) => boolean;
  focusPanel: (panelId: string) => boolean;
}

export function createDockviewHost(
  dockviewId: string,
  api: DockviewApi,
  panelLookup?: PanelLookup,
): DockviewHost {
  return {
    dockviewId,
    api,
    addPanel: (panelId, options) =>
      addDockviewPanel(api, panelId, options, panelLookup),
    isPanelOpen: (panelId, allowMultiple = false) =>
      isPanelOpen(api, panelId, allowMultiple),
    focusPanel: (panelId) => focusPanel(api, panelId),
  };
}
