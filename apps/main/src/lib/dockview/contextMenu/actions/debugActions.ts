import { useToastStore } from '@pixsim7/shared.ui';

import { getDockviewGroups, getDockviewPanels } from '../../panelAdd';
import { resolveCurrentDockviewApi } from '../resolveCurrentDockview';
import type { MenuAction, MenuActionContext } from '../types';

function notify(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  useToastStore.getState().addToast({
    type,
    message,
    duration: 4500,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getGroupPanelCount(group: unknown): number {
  if (!isRecord(group)) return 0;
  const panels = (group as any).panels;
  if (Array.isArray(panels)) return panels.length;
  if (panels && typeof panels.length === 'number') return panels.length;
  const model = (group as any).model;
  if (typeof model?.size === 'number') return model.size;
  return 0;
}

function buildDockviewSnapshot(ctx: MenuActionContext): Record<string, unknown> | null {
  const api = resolveCurrentDockviewApi(ctx);
  if (!api) return null;

  const groups = getDockviewGroups(api);
  const panels = getDockviewPanels(api);
  const contextData = isRecord(ctx.data) ? ctx.data : undefined;
  const backgroundTarget = isRecord(contextData?.dockviewBackgroundTarget)
    ? contextData?.dockviewBackgroundTarget
    : null;

  const groupSnapshots = groups.map((group: any) => {
    const panelCount = getGroupPanelCount(group);
    const groupPanels = Array.isArray(group?.panels) ? group.panels : [];
    return {
      id: typeof group?.id === 'string' ? group.id : null,
      panelCount,
      activePanelId: typeof group?.activePanel?.id === 'string' ? group.activePanel.id : null,
      panelIds: groupPanels
        .map((panel: any) => (typeof panel?.id === 'string' ? panel.id : null))
        .filter((panelId: string | null): panelId is string => panelId !== null),
      classes: typeof group?.element?.className === 'string' ? group.element.className : null,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    dockviewId: ctx.currentDockviewId ?? null,
    contextType: ctx.contextType,
    position: ctx.position ?? null,
    panelId: ctx.panelId ?? null,
    groupId: ctx.groupId ?? null,
    target: backgroundTarget,
    totals: {
      groups: groups.length,
      panels: panels.length,
      emptyGroups: groupSnapshots.filter((group) => group.panelCount === 0).length,
    },
    groups: groupSnapshots,
  };
}

async function copyJsonToClipboard(value: unknown): Promise<boolean> {
  const text = JSON.stringify(value, null, 2);
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function getEmptyGroups(api: unknown): any[] {
  if (!api) return [];
  return getDockviewGroups(api as any).filter((group) => getGroupPanelCount(group) === 0);
}

const debugSnapshotAction: MenuAction = {
  id: 'debug:dockview:snapshot',
  label: 'Log Snapshot',
  icon: 'bug',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: (ctx) => import.meta.env.DEV && !!resolveCurrentDockviewApi(ctx),
  execute: async (ctx) => {
    const snapshot = buildDockviewSnapshot(ctx);
    if (!snapshot) {
      notify('error', 'Dockview debug snapshot failed: no dockview API.');
      return;
    }

    console.groupCollapsed('[Dockview Debug] Snapshot');
    console.log(snapshot);
    console.groupEnd();

    const copied = await copyJsonToClipboard(snapshot);
    const totals = (snapshot.totals as any) ?? {};
    const summary = `groups=${totals.groups ?? '?'} panels=${totals.panels ?? '?'} empty=${totals.emptyGroups ?? '?'}`;
    notify(
      'info',
      copied
        ? `Dockview snapshot logged and copied to clipboard (${summary}).`
        : `Dockview snapshot logged (${summary}). Clipboard unavailable.`,
    );
  },
};

const pruneEmptyGroupsAction: MenuAction = {
  id: 'debug:dockview:prune-empty-groups',
  label: 'Prune Empty Groups',
  icon: 'trash-2',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: (ctx) => import.meta.env.DEV && !!resolveCurrentDockviewApi(ctx),
  disabled: (ctx) => {
    const api = resolveCurrentDockviewApi(ctx);
    if (!api) return true;
    return getEmptyGroups(api).length > 0 ? false : 'No empty groups found';
  },
  execute: (ctx) => {
    const api = resolveCurrentDockviewApi(ctx);
    if (!api) {
      notify('error', 'No dockview API found.');
      return;
    }

    const removeGroup = (api as any).removeGroup;
    if (typeof removeGroup !== 'function') {
      notify('error', 'Dockview API does not support removeGroup.');
      return;
    }

    const emptyGroups = getEmptyGroups(api);
    if (emptyGroups.length === 0) {
      notify('info', 'No empty groups to prune.');
      return;
    }

    let removed = 0;
    for (const group of emptyGroups) {
      const remainingGroups = getDockviewGroups(api).length;
      if (remainingGroups <= 1) break;
      try {
        removeGroup.call(api, group);
        removed += 1;
      } catch {
        // best effort; continue pruning remaining groups
      }
    }

    notify(
      removed > 0 ? 'success' : 'warning',
      removed > 0
        ? `Pruned ${removed} empty group${removed === 1 ? '' : 's'}.`
        : 'Empty groups detected but none were removed.',
    );
  },
};

const dockviewDebugSubmenuAction: MenuAction = {
  id: 'debug:dockview',
  label: 'Debug Dockview',
  icon: 'bug',
  category: 'debug',
  hideWhenEmpty: true,
  availableIn: ['background', 'tab', 'panel-content'],
  visible: () => import.meta.env.DEV,
  children: [
    { ...debugSnapshotAction, category: undefined },
    { ...pruneEmptyGroupsAction, category: undefined, divider: true },
  ],
  execute: () => {},
};

export const debugActions: MenuAction[] = [dockviewDebugSubmenuAction];
