/**
 * Layout Actions
 *
 * Context menu actions for layout operations:
 * - Split Right
 * - Split Down
 * - Move to New Group
 * - Join Left/Right Group
 */

import { addDockviewPanel, resolvePanelDefinitionId } from '../../panelAdd';
import type { MenuAction } from '../types';

type JoinDirection = 'left' | 'right';

const findAdjacentGroup = (
  ctx: { api?: any; groupId?: string },
  direction: JoinDirection
) => {
  if (!ctx.api || !ctx.groupId) return null;
  const groups = ctx.api.groups ?? [];
  const index = groups.findIndex((group: any) => group.id === ctx.groupId);
  if (index === -1) return null;
  const neighborIndex = direction === 'left' ? index - 1 : index + 1;
  return groups[neighborIndex] ?? null;
};

/**
 * Split the current panel to the right
 */
export const splitRightAction: MenuAction = {
  id: 'layout:split-right',
  label: 'Split Right',
  icon: 'columns',
  category: 'layout',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => !!ctx.panelId && !!ctx.api,
  execute: (ctx) => {
    if (!ctx.api || !ctx.panelId) return;
    const panel = ctx.api.getPanel(ctx.panelId);
    if (!panel) return;

    const currentGroup = panel.group;
    if (!currentGroup) return;

    // Create a new group to the right and move this panel to it
    const newGroup = ctx.api.addGroup({
      direction: 'right',
      referenceGroup: currentGroup,
    });

    if (newGroup) {
      panel.api.moveTo({ group: newGroup });
    }
  },
};

/**
 * Split the current panel downward
 */
export const splitDownAction: MenuAction = {
  id: 'layout:split-down',
  label: 'Split Down',
  icon: 'rows',
  category: 'layout',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => !!ctx.panelId && !!ctx.api,
  execute: (ctx) => {
    if (!ctx.api || !ctx.panelId) return;
    const panel = ctx.api.getPanel(ctx.panelId);
    if (!panel) return;

    const currentGroup = panel.group;
    if (!currentGroup) return;

    // Create a new group below and move this panel to it
    const newGroup = ctx.api.addGroup({
      direction: 'below',
      referenceGroup: currentGroup,
    });

    if (newGroup) {
      panel.api.moveTo({ group: newGroup });
    }
  },
};

/**
 * Move panel to a new group (detach from current group)
 */
export const moveToNewGroupAction: MenuAction = {
  id: 'layout:move-to-new-group',
  label: 'Move to New Group',
  icon: 'move',
  category: 'layout',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => {
    if (!ctx.api || !ctx.panelId || !ctx.groupId) return false;
    // Only show if there are multiple panels in the group
    const group = ctx.api.getGroup(ctx.groupId);
    return group ? group.panels.length > 1 : false;
  },
  execute: (ctx) => {
    if (!ctx.api || !ctx.panelId) return;
    const panel = ctx.api.getPanel(ctx.panelId);
    if (!panel) return;

    const currentGroup = panel.group;
    if (!currentGroup) return;

    // Create new group and move panel to it
    const newGroup = ctx.api.addGroup({
      direction: 'right',
      referenceGroup: currentGroup,
    });

    if (newGroup) {
      panel.api.moveTo({ group: newGroup });
    }
  },
};

/**
 * Join the panel into the group on the left
 */
export const joinLeftGroupAction: MenuAction = {
  id: 'layout:join-left-group',
  label: 'Join Left Group',
  icon: 'arrow-left',
  category: 'layout',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => !!ctx.api && !!ctx.panelId && !!ctx.groupId,
  disabled: (ctx) => {
    if (!ctx.api || !ctx.panelId || !ctx.groupId) return true;
    return findAdjacentGroup(ctx, 'left') ? false : 'No group to the left';
  },
  execute: (ctx) => {
    if (!ctx.api || !ctx.panelId || !ctx.groupId) return;
    const panel = ctx.api.getPanel(ctx.panelId);
    if (!panel) return;
    const targetGroup = findAdjacentGroup(ctx, 'left');
    if (!targetGroup) return;

    panel.api.moveTo({ group: targetGroup });
  },
};

/**
 * Join the panel into the group on the right
 */
export const joinRightGroupAction: MenuAction = {
  id: 'layout:join-right-group',
  label: 'Join Right Group',
  icon: 'arrow-right',
  category: 'layout',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => !!ctx.api && !!ctx.panelId && !!ctx.groupId,
  disabled: (ctx) => {
    if (!ctx.api || !ctx.panelId || !ctx.groupId) return true;
    return findAdjacentGroup(ctx, 'right') ? false : 'No group to the right';
  },
  execute: (ctx) => {
    if (!ctx.api || !ctx.panelId || !ctx.groupId) return;
    const panel = ctx.api.getPanel(ctx.panelId);
    if (!panel) return;
    const targetGroup = findAdjacentGroup(ctx, 'right');
    if (!targetGroup) return;

    panel.api.moveTo({ group: targetGroup });
  },
};

/**
 * Move to Dockview action (dynamic submenu)
 */
const moveToDockviewAction: MenuAction = {
  id: 'layout:move-to-dockview',
  label: 'Move to Dockview',
  icon: 'external-link',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) =>
    !!ctx.panelId &&
    !!ctx.api &&
    (!!ctx.getDockviewHostIds || !!ctx.getDockviewIds) &&
    (!!ctx.getDockviewHost || !!ctx.getDockviewApi),
  children: (ctx) => {
    const ids = ctx.getDockviewHostIds?.() ?? ctx.getDockviewIds?.() ?? [];
    const currentId = ctx.currentDockviewId;
    const entries = ids.filter(id => id !== currentId);

    if (entries.length === 0) {
      return [{
        id: 'layout:move-to-dockview:empty',
        label: 'No other dockviews',
        availableIn: ['tab', 'panel-content'],
        disabled: () => true,
        execute: () => {},
      }];
    }

    return entries.map(id => ({
      id: `layout:move-to-dockview:${id}`,
      label: id,
      availableIn: ['tab', 'panel-content'] as const,
      execute: () => {
        if (!ctx.api || !ctx.panelId) return;
        const panel = ctx.api.getPanel(ctx.panelId);
        if (!panel) return;

        const targetHost = ctx.getDockviewHost?.(id);
        const targetApi = targetHost?.api ?? ctx.getDockviewApi?.(id);
        if (!targetApi) return;

        const panelId = resolvePanelDefinitionId(panel) ?? panel.id;
        if (typeof panelId !== 'string') return;
        const panelParams =
          (panel as { params?: Record<string, unknown> }).params ??
          (panel.api as { params?: Record<string, unknown> } | undefined)?.params;

        const registryEntry = ctx.panelRegistry?.getAll?.().find(p => p.id === panelId);
        const allowMultiple = !!registryEntry?.supportsMultipleInstances;

        if (!allowMultiple && targetHost?.isPanelOpen(panelId, false)) {
          targetHost.focusPanel(panelId);
          ctx.api.removePanel(panel);
          return;
        }

        if (targetHost) {
          targetHost.addPanel(panelId, {
            allowMultiple,
            title: panel.title ?? registryEntry?.title,
            params: panelParams,
          });
        } else {
          addDockviewPanel(targetApi, panelId, {
            allowMultiple,
            title: panel.title ?? registryEntry?.title,
            params: panelParams,
          });
        }

        ctx.api.removePanel(panel);
      },
    }));
  },
  execute: () => {},
};

/**
 * Split Panel submenu - groups split actions together
 */
export const splitPanelAction: MenuAction = {
  id: 'layout:split',
  label: 'Split Panel',
  icon: 'columns',
  category: 'layout',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => !!ctx.panelId && !!ctx.api,
  children: [
    { ...splitRightAction, category: undefined },
    { ...splitDownAction, category: undefined },
  ],
  execute: () => {},
};

/**
 * Move Panel submenu - groups move/join actions together
 */
export const movePanelAction: MenuAction = {
  id: 'layout:move',
  label: 'Move Panel',
  icon: 'move',
  category: 'layout',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => !!ctx.panelId && !!ctx.api,
  children: (ctx) => {
    const actions: MenuAction[] = [];

    // Move to new group (only if multiple panels in group)
    if (moveToNewGroupAction.visible?.(ctx) !== false) {
      actions.push({ ...moveToNewGroupAction, category: undefined });
    }

    // Join adjacent groups
    actions.push(
      { ...joinLeftGroupAction, category: undefined },
      { ...joinRightGroupAction, category: undefined },
    );

    // Move to other dockview (only if available)
    if (moveToDockviewAction.visible?.(ctx) !== false) {
      actions.push({ ...moveToDockviewAction, category: undefined, divider: true });
    }

    return actions;
  },
  execute: () => {},
};

/**
 * All layout actions - exported as consolidated submenus
 */
export const layoutActions: MenuAction[] = [
  splitPanelAction,
  movePanelAction,
];
