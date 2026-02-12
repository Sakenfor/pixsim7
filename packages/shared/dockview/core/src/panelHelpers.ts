/**
 * Panel Utilities (Framework-Agnostic)
 *
 * Shared functions for working with dockview panels.
 * Works with both dockview (React) and dockview-core (vanilla).
 */

import type { DockviewApi, IDockviewPanel } from 'dockview-core';
import type { PanelLookup, PanelPosition } from './types';

export interface AddPanelOptions {
  /** Allow multiple instances of this panel */
  allowMultiple?: boolean;
  /** Custom instance ID (auto-generated if allowMultiple) */
  instanceId?: string;
  /** Override title */
  title?: string;
  /** Panel parameters */
  params?: Record<string, unknown>;
  /** Position relative to another panel */
  position?: PanelPosition;
  /** Initial width (for left/right positions) */
  initialWidth?: number;
  /** Initial height (for above/below positions) */
  initialHeight?: number;
}

/**
 * Get all panels from a dockview API instance
 */
export function getPanels(api: DockviewApi): IDockviewPanel[] {
  const rawPanels = (api as any).panels;
  if (Array.isArray(rawPanels)) return rawPanels;
  if (rawPanels && typeof rawPanels.values === 'function') {
    return Array.from(rawPanels.values());
  }
  return [];
}

/**
 * Get all groups from a dockview API instance
 */
export function getGroups(api: DockviewApi): any[] {
  const rawGroups = (api as any).groups;
  if (Array.isArray(rawGroups)) return rawGroups;
  if (rawGroups && typeof rawGroups.values === 'function') {
    return Array.from(rawGroups.values());
  }
  return [];
}

/**
 * Get the number of groups in a dockview
 */
export function getGroupCount(api: DockviewApi, groups?: any[]): number {
  if (Array.isArray(groups)) return groups.length;
  return getGroups(api).length;
}

/**
 * Resolve the panel definition ID from a dockview panel
 */
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

/**
 * Find a panel by ID in a dockview
 */
export function findPanel(api: DockviewApi, panelId: string): IDockviewPanel | undefined {
  const panels = getPanels(api);
  return panels.find((panel) => {
    const resolved = resolvePanelDefinitionId(panel);
    return resolved === panelId || panel?.id === panelId;
  });
}

/**
 * Check if a panel is currently open
 */
export function isPanelOpen(api: DockviewApi, panelId: string, allowMultiple = false): boolean {
  if (allowMultiple) return false;
  return !!findPanel(api, panelId);
}

/**
 * Focus an existing panel (make it active)
 */
export function focusPanel(api: DockviewApi, panelId: string): boolean {
  const panel = findPanel(api, panelId);
  if (panel?.api?.setActive) {
    panel.api.setActive();
    return true;
  }
  return false;
}

/**
 * Generate a unique instance ID for multi-instance panels
 */
function createInstanceId(panelId: string): string {
  return `${panelId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Add a panel to a dockview
 *
 * @returns Instance ID of the added panel, or null if focused existing
 */
export function addPanel(
  api: DockviewApi,
  panelId: string,
  options: AddPanelOptions = {},
  panelLookup?: PanelLookup,
): string | null {
  const allowMultiple = !!options.allowMultiple;

  // If single-instance, try to focus existing panel
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
    initialWidth: options.initialWidth,
    initialHeight: options.initialHeight,
  });

  return instanceId;
}

/**
 * Remove a panel from a dockview
 */
export function removePanel(api: DockviewApi, panelId: string): boolean {
  const panel = findPanel(api, panelId);
  if (panel) {
    api.removePanel(panel);
    return true;
  }
  return false;
}

/**
 * Toggle a panel (show if hidden, hide if shown)
 */
export function togglePanel(
  api: DockviewApi,
  panelId: string,
  options: AddPanelOptions = {},
  panelLookup?: PanelLookup,
): boolean {
  const panel = findPanel(api, panelId);
  if (panel) {
    api.removePanel(panel);
    return false; // Panel is now hidden
  } else {
    addPanel(api, panelId, options, panelLookup);
    return true; // Panel is now shown
  }
}

export interface EnsurePanelsOptions {
  /** Resolve add panel options per panel */
  resolveOptions?: (panelId: string, api: DockviewApi) => AddPanelOptions | undefined;
}

/**
 * Ensure a list of panels exist in the dockview
 *
 * @returns Array of instance IDs that were added
 */
export function ensurePanels(
  api: DockviewApi,
  panelIds: Iterable<string>,
  options: EnsurePanelsOptions = {},
  panelLookup?: PanelLookup,
): string[] {
  const added: string[] = [];
  if (!api) return added;

  for (const panelId of panelIds) {
    if (findPanel(api, panelId)) {
      continue;
    }

    const resolvedOptions = options.resolveOptions?.(panelId, api) ?? {};
    const instanceId = addPanel(api, panelId, resolvedOptions, panelLookup);
    if (instanceId) {
      added.push(instanceId);
    }
  }

  return added;
}
