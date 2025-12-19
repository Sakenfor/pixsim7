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
 *
 * This action is available for any dockview that provides a floatPanelHandler.
 * No assumptions about implementation - fully dynamic and extensible.
 */
export const floatPanelAction: MenuAction = {
  id: 'panel:float',
  label: 'Float Panel',
  icon: 'external-link',
  category: 'panel',
  availableIn: ['tab'],
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
