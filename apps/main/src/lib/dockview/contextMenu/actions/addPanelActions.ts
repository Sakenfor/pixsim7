/**
 * Add Panel Actions
 *
 * Context menu actions for adding panels to dockview:
 * - Shows available panels grouped by category
 * - Only shows panels registered in the panel catalog
 */

import { registerActionsFromDefinitions } from '@lib/capabilities';

import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { addDockviewPanel, isPanelOpen } from '../../panelAdd';
import { menuActionsToCapabilityActions } from '../actionAdapters';
import { resolveCurrentDockview } from '../resolveCurrentDockview';
import type { MenuAction, MenuActionContext } from '../types';

import { DOCKVIEW_ACTION_FEATURE_ID, ensureDockviewActionFeature } from './feature';

/**
 * Get panels grouped by category from the panel catalog
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

  const defaultCategory = 'Other';

  for (const panel of allPanels) {
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
  const { api, host } = resolveCurrentDockview(ctx);
  if (!api) return;

  const registryEntry = ctx.panelRegistry?.getAll?.().find(p => p.id === panelId);
  const panelTitle = registryEntry?.title ?? panelId;

  if (!allowMultiple && (host?.isPanelOpen(panelId, allowMultiple) ?? isPanelOpen(api, panelId, allowMultiple))) {
    return;
  }

  if (host) {
    host.addPanel(panelId, {
      allowMultiple,
      title: panelTitle,
    });
  } else {
    addDockviewPanel(api, panelId, {
      allowMultiple,
      title: panelTitle,
    });
  }
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
    const { api, host } = resolveCurrentDockview(ctx);

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
          disabled: () =>
            panel.supportsMultipleInstances
              ? false
              : api && (host?.isPanelOpen(panel.id, false) ?? isPanelOpen(api, panel.id, false)) ? 'Already open' : false,
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
  const pinnedIds = useWorkspaceStore.getState().pinnedQuickAddPanels;
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
          const { api, host } = resolveCurrentDockview(c);
          return !!api && !(host?.isPanelOpen(panelId, false) ?? isPanelOpen(api, panelId, false));
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
      const { api, host } = resolveCurrentDockview(ctx);
      return !!api && !(host?.isPanelOpen('gallery', false) ?? isPanelOpen(api, 'gallery', false));
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
      const { api, host } = resolveCurrentDockview(ctx);
      return !!api && !(host?.isPanelOpen('inspector', false) ?? isPanelOpen(api, 'inspector', false));
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
