/**
 * Add Panel Actions
 *
 * Context menu actions for adding panels to dockview:
 * - Shows available panels grouped by category
 * - Only shows panels registered in the panel catalog
 */

import { menuActionsToCapabilityActions } from '@pixsim7/shared.ui.context-menu';

import { registerActionsFromDefinitions } from '@lib/capabilities';
import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { getDockWidgetByDockviewId, getDockWidgetPanelIds } from '@features/panels';
import { useWorkspaceStore } from '@features/workspace';

import { pinnedPanelIdsFrom } from '@/components/navigation/shortcutDrag';

import { resolveCurrentDockview } from '../resolveCurrentDockview';
import type { MenuAction, MenuActionContext } from '../types';

import { DOCKVIEW_ACTION_FEATURE_ID, ensureDockviewActionFeature } from './feature';
import { addPanelInCurrentDockview, isPanelOpenInCurrentDockview } from './panelOpenUtils';

function getScopedPanelIds(ctx: MenuActionContext): string[] | undefined {
  const scoped = ctx.scopedPanelIds;
  return scoped && scoped.length > 0 ? scoped : undefined;
}

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

  return false;
}

/**
 * Get panels grouped by category from the panel catalog.
 *
 * Filtering rules (in order):
 *   1. Scope: if the host published `scopedPanelIds` (SmartDockview does this —
 *      it's the dock's configured panels + scope-discovered extras), restrict
 *      to that set. This is what makes "Add Panel" respect availability and
 *      capability gates without re-running `getCompatiblePanels` here.
 *   2. Self-exclusion: never offer the host dockview's own panel id. Prevents
 *      recursive "add Media Viewer inside Media Viewer" entries.
 *   3. Already-open single-instance panels are hidden outright (not greyed).
 *      The "Add Panel" menu is for adding; showing an entry you can't click
 *      just adds noise. Multi-instance panels stay — user may legitimately
 *      want another copy.
 *
 * When no scopedPanelIds are published (legacy docks that haven't opted in),
 * we fall back to the full public catalog to preserve old behavior.
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

  const scopedPanelIds = ctx.scopedPanelIds;
  const scopedSet =
    scopedPanelIds && scopedPanelIds.length > 0 ? new Set(scopedPanelIds) : null;
  const hostPanelId = ctx.currentDockviewId;

  const defaultCategory = 'Other';

  for (const panel of allPanels) {
    if (scopedSet && !scopedSet.has(panel.id)) continue;
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

function getPanelRegistryEntries(ctx: MenuActionContext) {
  if (!ctx.panelRegistry) return [];
  return ctx.panelRegistry.getPublicPanels
    ? ctx.panelRegistry.getPublicPanels()
    : ctx.panelRegistry.getAll();
}

export function getDefaultScopePanelSubmenu(ctx: MenuActionContext, api: ReturnType<typeof resolveCurrentDockview>["api"]): MenuAction | null {
  if (!ctx.currentDockviewId || !ctx.panelRegistry) return null;

  const dockWidget = getDockWidgetByDockviewId(ctx.currentDockviewId);
  const scopeLabel = dockWidget?.label ?? ctx.currentDockviewId;

  // Prefer scoped panel IDs from SmartDockview (actual host configuration),
  // then fall back to dock zone registry defaults.
  const dockZonePanelIds = getDockWidgetPanelIds(ctx.currentDockviewId);
  const scopedPanelIds = getScopedPanelIds(ctx);
  const scopedIds = scopedPanelIds && scopedPanelIds.length > 0
    ? scopedPanelIds
    : dockZonePanelIds;

  if (!scopedIds?.length) return null;

  const panelMap = new Map(getPanelRegistryEntries(ctx).map((p) => [p.id, p]));

  const children = scopedIds
    .map((panelId) => {
      const panel = panelMap.get(panelId);
      if (!panel) return null;
      return {
        id: `panel:add:default-scope:${panel.id}`,
        label: panel.title,
        icon: panel.icon,
        availableIn: ['background', 'tab', 'panel-content'] as const,
        disabled: () => getPanelAddDisabledReason(ctx, panel.id, !!panel.supportsMultipleInstances, !!api),
        execute: () => addPanel(ctx, panel.id, !!panel.supportsMultipleInstances),
      } satisfies MenuAction;
    })
    .filter((item): item is MenuAction => item !== null);

  if (!children.length) return null;

  return {
    id: `panel:add:defaults:${ctx.currentDockviewId}`,
    label: `Default Panels (${scopeLabel})`,
    icon: 'layout',
    availableIn: ['background', 'tab', 'panel-content'],
    children,
    execute: () => {},
  };
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
 * Get quick-add actions dynamically from the user's pinned panels.
 */
export function getQuickAddActions(ctx: MenuActionContext): MenuAction[] {
  const pinnedIds = pinnedPanelIdsFrom(useWorkspaceStore.getState().pinnedShortcuts);
  if (!pinnedIds.length || !ctx.panelRegistry) return [];

  const allPanels = ctx.panelRegistry.getPublicPanels
    ? ctx.panelRegistry.getPublicPanels()
    : ctx.panelRegistry.getAll();

  const panelMap = new Map(allPanels.map(p => [p.id, p]));

  return pinnedIds
    .map((panelId) => {
      const panel = panelMap.get(panelId);
      if (!panel) return null;
      return {
        id: `panel:quick-add:${panelId}`,
        label: `Add ${panel.title}`,
        icon: panel.icon,
        category: 'quick-add',
        availableIn: ['background'] as const,
        visible: (c: MenuActionContext) => {
          const { api } = resolveCurrentDockview(c);
          return !!api && !isPanelOpenInCurrentDockview(c, panelId, false);
        },
        execute: (c: MenuActionContext) => addPanel(c, panelId, !!panel.supportsMultipleInstances),
      } satisfies MenuAction;
    })
    .filter((a): a is MenuAction => a !== null);
}

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
 * Quick add common panels (shown at top level for convenience)
 * @deprecated Use getQuickAddActions() for dynamic pinned panels
 */
export const quickAddActions: MenuAction[] = [
  {
    id: 'panel:quick-add:gallery',
    label: 'Add Gallery',
    icon: 'image',
    category: 'quick-add',
    availableIn: ['background'],
    visible: (ctx) => {
      const { api } = resolveCurrentDockview(ctx);
      return !!api && !isPanelOpenInCurrentDockview(ctx, 'gallery', false);
    },
    execute: (ctx) => addPanel(ctx, 'gallery', false),
  },
  {
    id: 'panel:quick-add:inspector',
    label: 'Add Inspector',
    icon: 'info',
    category: 'quick-add',
    availableIn: ['background'],
    visible: (ctx) => {
      const { api } = resolveCurrentDockview(ctx);
      return !!api && !isPanelOpenInCurrentDockview(ctx, 'inspector', false);
    },
    execute: (ctx) => addPanel(ctx, 'inspector', false),
  },
];

const quickAddDescriptions: Record<string, string> = {
  'panel:quick-add:gallery': 'Add the Gallery panel to this dockview',
  'panel:quick-add:inspector': 'Add the Inspector panel to this dockview',
};

const quickAddCapabilityMapping = menuActionsToCapabilityActions(quickAddActions, {
  featureId: DOCKVIEW_ACTION_FEATURE_ID,
  descriptions: quickAddDescriptions,
});

export const quickAddActionDefinitions = quickAddCapabilityMapping.actionDefinitions;

let quickAddActionCapabilitiesRegistered = false;

export function registerQuickAddActionCapabilities() {
  if (quickAddActionCapabilitiesRegistered) return;
  quickAddActionCapabilitiesRegistered = true;

  ensureDockviewActionFeature();
  registerActionsFromDefinitions(quickAddActionDefinitions);
}

/**
 * All add panel actions
 */
export const addPanelActions: MenuAction[] = [
  addPanelAction,
];
