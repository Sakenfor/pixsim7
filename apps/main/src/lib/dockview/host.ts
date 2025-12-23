import type { DockviewApi } from 'dockview-core';
import type { AddDockviewPanelOptions } from './panelAdd';
import { addDockviewPanel, focusPanel, isPanelOpen } from './panelAdd';

export interface DockviewHost {
  dockviewId: string;
  api: DockviewApi;
  addPanel: (panelId: string, options?: AddDockviewPanelOptions) => string | null;
  isPanelOpen: (panelId: string, allowMultiple?: boolean) => boolean;
  focusPanel: (panelId: string) => boolean;
}

export function createDockviewHost(dockviewId: string, api: DockviewApi): DockviewHost {
  return {
    dockviewId,
    api,
    addPanel: (panelId, options) =>
      addDockviewPanel(api, panelId, options),
    isPanelOpen: (panelId, allowMultiple = false) =>
      isPanelOpen(api, panelId, allowMultiple),
    focusPanel: (panelId) => focusPanel(api, panelId),
  };
}
