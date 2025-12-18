/**
 * Panel Actions
 *
 * Context menu actions for panel operations:
 * - Close Panel
 * - Maximize Panel
 * - Float Panel (open as floating window)
 * - Duplicate Panel
 */

import type { MenuAction } from '../types';

/**
 * Close the current panel
 */
export const closePanelAction: MenuAction = {
  id: 'panel:close',
  label: 'Close Panel',
  icon: 'x',
  category: 'panel',
  shortcut: '⌘W',
  availableIn: ['tab'],
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
 * Maximize/restore the current panel
 */
export const maximizePanelAction: MenuAction = {
  id: 'panel:maximize',
  label: 'Maximize Panel',
  icon: 'maximize-2',
  category: 'panel',
  availableIn: ['tab'],
  visible: (ctx) => !!ctx.panelId && !!ctx.api,
  execute: (ctx) => {
    if (!ctx.api || !ctx.panelId) return;
    const panel = ctx.api.getPanel(ctx.panelId);
    if (panel) {
      // Toggle maximize - if already maximized, exit; otherwise maximize
      if (ctx.api.maximizedGroup) {
        ctx.api.exitMaximizedGroup();
      } else {
        panel.api.maximize();
      }
    }
  },
};

/**
 * Float the panel as a separate window
 * Uses workspaceStore.openFloatingPanel
 */
export const floatPanelAction: MenuAction = {
  id: 'panel:float',
  label: 'Float Panel',
  icon: 'external-link',
  category: 'panel',
  availableIn: ['tab'],
  visible: (ctx) => !!ctx.panelId && !!ctx.workspaceStore,
  execute: (ctx) => {
    if (!ctx.panelId || !ctx.workspaceStore) return;

    // Get panel title for the floating window
    const panel = ctx.api?.getPanel(ctx.panelId);
    const panelTitle = panel?.title || ctx.panelId;

    // Open as floating panel
    ctx.workspaceStore.getState().openFloatingPanel(ctx.panelId as any, {
      width: 600,
      height: 400,
    });

    // Optionally close from dockview after floating
    if (panel && ctx.api) {
      ctx.api.removePanel(panel);
    }
  },
};

/**
 * Close all other panels in the same group
 */
export const closeOtherPanelsAction: MenuAction = {
  id: 'panel:close-others',
  label: 'Close Other Tabs',
  icon: 'x-circle',
  category: 'panel',
  availableIn: ['tab'],
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
  availableIn: ['tab'],
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
  maximizePanelAction,
  floatPanelAction,
  closeOtherPanelsAction,
  closeAllInGroupAction,
];
