/**
 * Panel addition and management utilities (shared, app-agnostic)
 */

import type { DockviewApi } from 'dockview-core';

import type { PanelLookup } from './hostTypes';

export interface AddDockviewPanelOptions {
  allowMultiple?: boolean;
  instanceId?: string;
  title?: string;
  params?: Record<string, unknown>;
  position?: {
    direction: 'left' | 'right' | 'above' | 'below' | 'within';
    referencePanel?: string;
  };
}

export interface EnsurePanelsOptions {
  /** Resolve add panel options per panel (allows custom titles/positions). */
  resolveOptions?: (panelId: string, api: DockviewApi) => AddDockviewPanelOptions | undefined;
}

function getDockviewPanels(api: DockviewApi): any[] {
  const rawPanels = (api as any).panels;
  if (Array.isArray(rawPanels)) return rawPanels;
  if (rawPanels && typeof rawPanels.values === 'function') {
    return Array.from(rawPanels.values());
  }
  return [];
}

export function resolvePanelDefinitionId(panel: any): string | undefined {
  const params = panel?.params ?? panel?.api?.params;
  const paramPanelId = params?.panelId;
  if (typeof paramPanelId === 'string') return paramPanelId;
  if (typeof panel?.component === 'string' && panel.component !== 'panel') {
    return panel.component;
  }
  if (typeof panel?.id === 'string') return panel.id;
  return undefined;
}

export function findDockviewPanel(api: DockviewApi, panelId: string): any | undefined {
  const panels = getDockviewPanels(api);
  return panels.find((panel) => {
    const resolved = resolvePanelDefinitionId(panel);
    return resolved === panelId || panel?.id === panelId;
  });
}

export function isPanelOpen(api: DockviewApi, panelId: string, allowMultiple: boolean): boolean {
  if (allowMultiple) return false;
  return !!findDockviewPanel(api, panelId);
}

export function focusPanel(api: DockviewApi, panelId: string): boolean {
  const panel = findDockviewPanel(api, panelId);
  if (panel?.api?.setActive) {
    panel.api.setActive();
    return true;
  }
  return false;
}

function createInstanceId(panelId: string): string {
  return `${panelId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function addDockviewPanel(
  api: DockviewApi,
  panelId: string,
  options: AddDockviewPanelOptions = {},
  panelLookup?: PanelLookup,
): string | null {
  const allowMultiple = !!options.allowMultiple;
  if (!allowMultiple && focusPanel(api, panelId)) {
    return panelId;
  }

  const definition = panelLookup?.get(panelId);
  const title = options.title ?? definition?.title ?? panelId;
  const instanceId = options.instanceId ?? (allowMultiple ? createInstanceId(panelId) : panelId);
  const params = { ...(options.params ?? {}), panelId };

  api.addPanel({
    id: instanceId,
    component: panelId,
    title,
    params,
    position: options.position,
  });

  return instanceId;
}

export function ensurePanels(
  api: DockviewApi,
  panelIds: Iterable<string>,
  options: EnsurePanelsOptions = {},
  panelLookup?: PanelLookup,
): string[] {
  const added: string[] = [];
  if (!api) return added;

  for (const panelId of panelIds) {
    if (findDockviewPanel(api, panelId)) {
      continue;
    }

    const resolvedOptions = options.resolveOptions?.(panelId, api) ?? {};
    const instanceId = addDockviewPanel(api, panelId, resolvedOptions, panelLookup);
    if (instanceId) {
      added.push(instanceId);
    }
  }

  return added;
}
