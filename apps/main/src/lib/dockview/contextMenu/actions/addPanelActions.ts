/**
 * Add Panel Actions
 *
 * Context menu actions for adding panels to dockview:
 * - Shows available panels grouped by category
 * - Only shows panels registered in the panel catalog
 */

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { useWorkspaceStore } from '@features/workspace';

import { resolveCurrentDockview } from '../resolveCurrentDockview';
import type { MenuAction, MenuActionContext } from '../types';

import { addPanelInCurrentDockview, isPanelOpenAnywhere, isPanelOpenInCurrentDockview } from './panelOpenUtils';

function getAddPanelEquivalentIds(panelId: string): string[] {
  const panelDef = panelSelectors.get(panelId) as { addPanelEquivalentIds?: unknown } | undefined;
  if (!Array.isArray(panelDef?.addPanelEquivalentIds)) {
    return [];
  }
  return panelDef.addPanelEquivalentIds.filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}

/**
 * Check reverse equivalence: is any open panel in this dockview declaring
 * `panelId` as one of its equivalents?
 */
function isRepresentedByOpenPanel(ctx: MenuActionContext, panelId: string): boolean {
  const allPanels = ctx.panelRegistry?.getAll?.() ?? [];
  for (const panel of allPanels) {
    if (panel.id === panelId) continue;
    const equivalents = getAddPanelEquivalentIds(panel.id);
    if (equivalents.includes(panelId) && isPanelOpenInCurrentDockview(ctx, panel.id, false)) {
      return true;
    }
  }
  return false;
}

function getPanelAddDisabledReason(
  ctx: MenuActionContext,
  panelId: string,
  allowMultiple: boolean,
  hasApi: boolean,
): string | false {
  if (!hasApi) return false;

  if (isPanelOpenInCurrentDockview(ctx, panelId, allowMultiple)) {
    return 'Already open';
  }

  if (allowMultiple) return false;

  // Forward: candidate declares equivalents that are already open
  for (const equivalentId of getAddPanelEquivalentIds(panelId)) {
    if (isPanelOpenInCurrentDockview(ctx, equivalentId, false)) {
      return 'Already represented';
    }
  }

  // Reverse: an open panel declares this candidate as its equivalent
  if (isRepresentedByOpenPanel(ctx, panelId)) {
    return 'Already represented';
  }

  // Cross-dockview: panel lives in some other dockview host in the app.
  // Mirrors the Quick Add logic so a panel open elsewhere is flagged here too,
  // keeping both menu surfaces consistent.
  if (isPanelOpenAnywhere(ctx, panelId)) {
    return 'Already open elsewhere';
  }

  return false;
}

/**
 * Get panels grouped by category from the panel catalog.
 *
 * Shows the full public catalog so users can browse every panel regardless of
 * the dock they right-clicked in. Earlier iterations restricted Add Panel to
 * `scopedPanelIds` (dock layout + scope-discovered extras) to "cut noise",
 * but that made discovery too restrictive — workspace-scope docks only
 * declare a handful of panels in `availableIn`, so the menu surfaced almost
 * nothing. Add Panel is now purely a browsable catalog.
 *
 * Filtering:
 *   - Self-exclusion: never offer the host dockview's own panel id.
 *   - Already-open single-instance panels are hidden outright; multi-instance
 *     panels stay so a user can legitimately add another copy.
 */
function getPanelsByCategory(ctx: MenuActionContext): Map<string, Array<{
  id: string;
  title: string;
  icon?: string;
  supportsMultipleInstances?: boolean;
}>> {
  if (!ctx.panelRegistry) return new Map();

  const categories = new Map<string, Array<{
    id: string;
    title: string;
    icon?: string;
    supportsMultipleInstances?: boolean;
  }>>();
  const allPanels = ctx.panelRegistry.getPublicPanels
    ? ctx.panelRegistry.getPublicPanels()
    : ctx.panelRegistry.getAll();

  const hostPanelId = ctx.currentDockviewId;
  const defaultCategory = 'Other';

  for (const panel of allPanels) {
    if (hostPanelId && panel.id === hostPanelId) continue;

    const allowMultiple = !!panel.supportsMultipleInstances;
    if (!allowMultiple && isPanelOpenInCurrentDockview(ctx, panel.id, false)) {
      continue;
    }

    const category = panel.category || defaultCategory;
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push({
      id: panel.id,
      title: panel.title,
      icon: panel.icon,
      supportsMultipleInstances: panel.supportsMultipleInstances,
    });
  }

  return categories;
}

function formatCategoryLabel(category: string): string {
  if (category === 'dev') return 'Dev';
  if (category === 'ui') return 'UI';
  if (category === 'api') return 'API';
  return category
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

/**
 * Add panel to the current dockview
 */
function addPanel(ctx: MenuActionContext, panelId: string, allowMultiple: boolean) {
  const registryEntry = ctx.panelRegistry?.getAll?.().find(p => p.id === panelId);
  const panelTitle = registryEntry?.title ?? panelId;

  if (getPanelAddDisabledReason(ctx, panelId, allowMultiple, true)) {
    return;
  }

  addPanelInCurrentDockview(ctx, panelId, {
    allowMultiple,
    title: panelTitle,
  });
}

/**
 * Add Panel action with nested category submenus
 */
export const addPanelAction: MenuAction = {
  id: 'panel:add',
  label: 'Add Panel',
  icon: 'plus-square',
  category: 'add',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: (ctx) => !!resolveCurrentDockview(ctx).api,
  children: (ctx) => {
    if (!ctx.panelRegistry) {
      return [{
        id: 'panel:add:missing',
        label: 'Panels unavailable',
        availableIn: ['background', 'tab', 'panel-content'],
        disabled: () => true,
        execute: () => {},
      }];
    }

    const categories = getPanelsByCategory(ctx);

    if (categories.size === 0) {
      return [{
        id: 'panel:add:empty',
        label: 'No panels available',
        availableIn: ['background', 'tab', 'panel-content'],
        disabled: () => true,
        execute: () => {},
      }];
    }

    // Create category submenus
    const categoryActions: MenuAction[] = [];
    const { api } = resolveCurrentDockview(ctx);

    // Sort categories (put "Core" first, "Other" last)
    const sortedCategories = Array.from(categories.entries()).sort(([a], [b]) => {
      if (a === 'Core') return -1;
      if (b === 'Core') return 1;
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });

    for (const [category, panels] of sortedCategories) {
      // Create category submenu
      categoryActions.push({
        id: `panel:add:category:${category}`,
        label: formatCategoryLabel(category),
        availableIn: ['background', 'tab', 'panel-content'],
        children: panels.map(panel => ({
          id: `panel:add:${panel.id}`,
          label: panel.title,
          icon: panel.icon,
          availableIn: ['background', 'tab', 'panel-content'] as const,
          disabled: () => getPanelAddDisabledReason(ctx, panel.id, !!panel.supportsMultipleInstances, !!api),
          execute: () => addPanel(ctx, panel.id, !!panel.supportsMultipleInstances),
        })),
        execute: () => {},
      });
    }

    return categoryActions;
  },
  execute: () => {}, // Parent doesn't execute
};

/**
 * Get "Edit Quick Add" submenu with toggleable pin items.
 */
export function getEditQuickAddActions(ctx: MenuActionContext): MenuAction {
  return {
    id: 'panel:edit-quick-add',
    label: 'Edit Quick Add',
    icon: 'pin',
    availableIn: ['background', 'tab', 'panel-content'],
    children: () => {
      const allPanels = ctx.panelRegistry?.getPublicPanels
        ? ctx.panelRegistry.getPublicPanels()
        : ctx.panelRegistry?.getAll() ?? [];
      const store = useWorkspaceStore.getState();

      return allPanels.map((panel) => ({
        id: `panel:edit-quick-add:${panel.id}`,
        label: `${store.isPinnedQuickAdd(panel.id) ? '✓ ' : ''}${panel.title}`,
        icon: panel.icon,
        availableIn: ['background', 'tab', 'panel-content'] as const,
        execute: () => {
          useWorkspaceStore.getState().toggleQuickAddPin(panel.id);
        },
      }));
    },
    execute: () => {},
  };
}

/**
 * All add panel actions
 */
export const addPanelActions: MenuAction[] = [
  addPanelAction,
];
