/**
 * Layout Actions
 *
 * Context menu actions for layout operations:
 * - Split Right
 * - Split Down
 * - Move to New Group
 * - Join Left/Right Group
 */

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
 * Join the panel into the group on the left
 */
export const joinLeftGroupAction: MenuAction = {
  id: 'layout:join-left-group',
  label: 'Join Left Group',
  icon: 'arrow-left',
  category: 'layout',
  availableIn: ['tab'],
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

    ctx.api.moveGroupOrPanel({
      from: { groupId: ctx.groupId, panelId: ctx.panelId },
      to: { group: targetGroup },
    });
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
  availableIn: ['tab'],
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

    ctx.api.moveGroupOrPanel({
      from: { groupId: ctx.groupId, panelId: ctx.panelId },
      to: { group: targetGroup },
    });
  },
};

/**
 * All layout actions
 */
export const layoutActions: MenuAction[] = [
  splitRightAction,
  splitDownAction,
  moveToNewGroupAction,
  joinLeftGroupAction,
  joinRightGroupAction,
];
