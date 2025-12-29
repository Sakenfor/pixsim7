/**
 * Panel Actions
 *
 * Context menu actions for panel operations:
 * - Close Panel
 * - Maximize Panel
 * - Float Panel (open as floating window)
 * - Duplicate Panel
 */

import type { MenuAction, MenuActionContext } from '../types';
import { usePropertiesPopupStore } from '../PanelPropertiesPopup';

/**
 * Close the current panel
 */
export const closePanelAction: MenuAction = {
  id: 'panel:close',
  label: 'Close Panel',
  icon: 'x',
  category: 'panel',
  shortcut: '⌘W',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => !!ctx.panelId && !!ctx.api,
  execute: (ctx) => {
    if (!ctx.api || !ctx.panelId) return;
    const panel = ctx.api.getPanel(ctx.panelId);
    if (panel) {
      ctx.api.removePanel(panel);
    }
  },
};

/**
 * Helper to check if panel is maximized
 */
function isPanelMaximized(ctx: MenuActionContext): boolean {
  if (!ctx.api || !ctx.panelId) return false;
  const panel = ctx.api.getPanel(ctx.panelId);
  return panel?.api?.isMaximized?.() ?? false;
}

/**
 * Maximize the current panel (only visible when not maximized)
 */
export const maximizePanelAction: MenuAction = {
  id: 'panel:maximize',
  label: 'Maximize Panel',
  icon: 'maximize-2',
  category: 'panel',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => !!ctx.panelId && !!ctx.api && !isPanelMaximized(ctx),
  execute: (ctx) => {
    if (!ctx.api || !ctx.panelId) return;
    const panel = ctx.api.getPanel(ctx.panelId);
    if (panel) {
      panel.api.maximize();
    }
  },
};

/**
 * Restore a maximized panel
 */
export const restorePanelAction: MenuAction = {
  id: 'panel:restore',
  label: 'Restore Panel',
  icon: 'minimize-2',
  category: 'panel',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => isPanelMaximized(ctx),
  execute: (ctx) => {
    if (!ctx.api || !ctx.panelId) return;
    const panel = ctx.api.getPanel(ctx.panelId);
    if (panel?.api?.isMaximized?.()) {
      panel.api.exitMaximized();
    }
  },
};

/**
 * Float the panel as a separate window
 *
 * This action is available for any dockview that provides a floatPanelHandler.
 * No assumptions about implementation - fully dynamic and extensible.
 */
export const floatPanelAction: MenuAction = {
  id: 'panel:float',
  label: 'Float Panel',
  icon: 'external-link',
  category: 'panel',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => {
    // Only requires a float handler - no assumptions about implementation
    return !!ctx.panelId && !!ctx.floatPanelHandler;
  },
  execute: (ctx) => {
    if (!ctx.panelId || !ctx.floatPanelHandler || !ctx.api) return;

    const panel = ctx.api.getPanel(ctx.panelId);
    if (!panel) return;

    // Call the dockview's float handler with panel info
    ctx.floatPanelHandler(ctx.panelId, panel, {
      width: 600,
      height: 400,
    });

    // Close from dockview after floating
    ctx.api.removePanel(panel);
  },
};

function getOpenPanels(ctx: MenuActionContext) {
  if (!ctx.api) return [];
  const rawPanels = Array.isArray(ctx.api.panels)
    ? ctx.api.panels
    : typeof (ctx.api as any).panels?.values === 'function'
      ? Array.from((ctx.api as any).panels.values())
      : [];

  return rawPanels.map((panel: any) => {
    const title =
      panel?.api?.title ??
      panel?.title ??
      panel?.params?.title ??
      panel?.id;
    return {
      id: panel?.id,
      title: title ?? panel?.id,
      panel,
    };
  }).filter((entry) => typeof entry.id === 'string');
}

/**
 * Focus an existing panel in this dockview
 */
export const focusPanelAction: MenuAction = {
  id: 'panel:focus',
  label: 'Focus Panel',
  icon: 'target',
  category: 'panel',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: (ctx) => !!ctx.api,
  children: (ctx) => {
    const openPanels = getOpenPanels(ctx).sort((a, b) => {
      return String(a.title).localeCompare(String(b.title));
    });

    if (openPanels.length === 0) {
      return [{
        id: 'panel:focus:empty',
        label: 'No panels open',
        availableIn: ['background', 'tab', 'panel-content'],
        disabled: () => true,
        execute: () => {},
      }];
    }

    return openPanels.map(({ id, title, panel }) => ({
      id: `panel:focus:${id}`,
      label: String(title),
      availableIn: ['background', 'tab', 'panel-content'] as const,
      execute: () => {
        panel?.api?.setActive?.();
      },
    }));
  },
  execute: () => {},
};

function resolvePanelDefinitionId(ctx: MenuActionContext): string | undefined {
  const dataPanelId = ctx.data?.panelId;
  if (typeof dataPanelId === 'string') return dataPanelId;
  if (typeof ctx.panelId === 'string') return ctx.panelId;
  return undefined;
}

/**
 * Context-aware Properties action.
 * Shows different properties based on what was clicked:
 * - Panel: shows panel info, instance, scopes
 * - Node/Asset/etc: shows item properties from ctx.data
 */
export const propertiesAction: MenuAction = {
  id: 'panel:properties', // Keep original ID for backwards compatibility
  label: 'Properties',
  icon: 'info',
  category: 'zzz', // Sort to end of menu
  availableIn: ['tab', 'panel-content', 'node', 'edge', 'asset', 'asset-card', 'canvas', 'item'],
  visible: (ctx) => {
    // For panel contexts, need a panel ID
    if (ctx.contextType === 'tab' || ctx.contextType === 'panel-content') {
      return !!resolvePanelDefinitionId(ctx);
    }
    // For other contexts, always show if we have position
    return !!ctx.position;
  },
  execute: (ctx) => {
    if (!ctx.position) return;

    const panelDefinitionId = resolvePanelDefinitionId(ctx);

    // Try to get panel definition from local registry (for feature dockviews)
    let panelDef: { title?: string; settingScopes?: string[]; scopes?: string[]; tags?: string[]; category?: string } | undefined;
    if (panelDefinitionId && ctx.panelRegistry) {
      panelDef = ctx.panelRegistry.getAll().find(p => p.id === panelDefinitionId);
    }

    // For panel contexts, use the panel's instanceId as hostId (matches per-panel ContextHubHost)
    // For other contexts, fall back to the contextHubState's hostId
    const isPanelContext = ctx.contextType === 'tab' || ctx.contextType === 'panel-content';
    const effectiveHostId = isPanelContext
      ? (ctx.instanceId ?? ctx.panelId)
      : ctx.contextHubState?.hostId;

    usePropertiesPopupStore.getState().open({
      position: ctx.position,
      contextType: ctx.contextType,
      panelId: panelDefinitionId,
      instanceId: ctx.instanceId ?? ctx.panelId,
      panelTitle: panelDef?.title,
      panelDefinition: panelDef,
      hostId: effectiveHostId,
      data: ctx.data as Record<string, unknown> | undefined,
      capabilities: ctx.capabilities,
    });
  },
};

/**
 * @deprecated Use propertiesAction instead
 */
export const panelPropertiesAction = propertiesAction;

/**
 * Close all other panels in the same group
 */
export const closeOtherPanelsAction: MenuAction = {
  id: 'panel:close-others',
  label: 'Close Other Tabs',
  icon: 'x-circle',
  category: 'panel',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => {
    if (!ctx.api || !ctx.groupId) return false;
    const group = ctx.api.getGroup(ctx.groupId);
    return group ? group.panels.length > 1 : false;
  },
  execute: (ctx) => {
    if (!ctx.api || !ctx.groupId || !ctx.panelId) return;
    const group = ctx.api.getGroup(ctx.groupId);
    if (!group) return;

    // Get all panels except the current one
    const panelsToClose = group.panels.filter(p => p.id !== ctx.panelId);
    panelsToClose.forEach(panel => {
      ctx.api!.removePanel(panel);
    });
  },
};

/**
 * Close all panels in the group
 */
export const closeAllInGroupAction: MenuAction = {
  id: 'panel:close-all-in-group',
  label: 'Close All in Group',
  icon: 'trash-2',
  category: 'panel',
  variant: 'danger',
  divider: true,
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => {
    if (!ctx.api || !ctx.groupId) return false;
    const group = ctx.api.getGroup(ctx.groupId);
    return group ? group.panels.length > 1 : false;
  },
  execute: (ctx) => {
    if (!ctx.api || !ctx.groupId) return;
    const group = ctx.api.getGroup(ctx.groupId);
    if (!group) return;

    // Close all panels in the group
    const panelsToClose = [...group.panels];
    panelsToClose.forEach(panel => {
      ctx.api!.removePanel(panel);
    });
  },
};

/**
 * All panel actions
 */
export const panelActions: MenuAction[] = [
  closePanelAction,
  closeOtherPanelsAction,
  closeAllInGroupAction,
  maximizePanelAction,
  restorePanelAction,
  floatPanelAction,
  focusPanelAction,
  propertiesAction,
];
