/**
 * Layout Actions
 *
 * Context menu actions for layout operations:
 * - Split Right
 * - Split Down
 * - Move to New Group
 */

import type { MenuAction } from '../types';

/**
 * Split the current panel to the right
 */
export const splitRightAction: MenuAction = {
  id: 'layout:split-right',
  label: 'Split Right',
  icon: 'columns',
  category: 'layout',
  availableIn: ['tab'],
  visible: (ctx) => !!ctx.panelId && !!ctx.api,
  execute: (ctx) => {
    if (!ctx.api || !ctx.panelId) return;
    const panel = ctx.api.getPanel(ctx.panelId);
    if (!panel) return;

    // Create a new group to the right of the current panel's group
    const group = panel.group;
    if (!group) return;

    // Move panel to a new group on the right
    ctx.api.addGroup({
      direction: 'right',
      referenceGroup: group,
    });
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
  availableIn: ['tab'],
  visible: (ctx) => !!ctx.panelId && !!ctx.api,
  execute: (ctx) => {
    if (!ctx.api || !ctx.panelId) return;
    const panel = ctx.api.getPanel(ctx.panelId);
    if (!panel) return;

    // Create a new group below the current panel's group
    const group = panel.group;
    if (!group) return;

    ctx.api.addGroup({
      direction: 'below',
      referenceGroup: group,
    });
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
  availableIn: ['tab'],
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
      ctx.api.moveGroupOrPanel({
        from: { groupId: currentGroup.id, panelId: ctx.panelId },
        to: { group: newGroup },
      });
    }
  },
};

/**
 * All layout actions
 */
export const layoutActions: MenuAction[] = [
  splitRightAction,
  splitDownAction,
  moveToNewGroupAction,
];
