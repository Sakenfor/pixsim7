/**
 * Add Panel Actions
 *
 * Context menu actions for adding panels to dockview:
 * - Shows available panels grouped by category
 * - Only shows panels registered in panelRegistry
 */

import type { MenuAction, MenuActionContext } from '../types';

/**
 * Get panels grouped by category from the panel registry
 */
function getPanelsByCategory(ctx: MenuActionContext): Map<string, Array<{ id: string; title: string; icon?: string }>> {
  if (!ctx.panelRegistry) return new Map();

  const categories = new Map<string, Array<{ id: string; title: string; icon?: string }>>();
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
 * Check if a panel is already open in the current dockview
 */
function isWorkspaceDockview(ctx: MenuActionContext): boolean {
  return ctx.currentDockviewId === 'workspace';
}

function isPanelOpen(ctx: MenuActionContext, panelId: string): boolean {
  if (!ctx.api) return false;
  const panels = Array.isArray(ctx.api.panels) ? ctx.api.panels : [];
  if (panels.length === 0 && !isWorkspaceDockview(ctx)) {
    return !!ctx.api.getPanel(panelId);
  }
  if (isWorkspaceDockview(ctx)) {
    return panels.some(p => p.params?.panelId === panelId);
  }
  return !!ctx.api.getPanel(panelId) || panels.some(p => p.id === panelId);
}

/**
 * Add panel to the current dockview
 */
function addPanel(ctx: MenuActionContext, panelId: string) {
  if (!ctx.api) return;

  const registryEntry = ctx.panelRegistry?.getAll?.().find(p => p.id === panelId);
  const panelTitle = registryEntry?.title ?? panelId;

  // Check if already open
  if (isPanelOpen(ctx, panelId)) {
    // Focus existing panel instead
    const existingPanel = isWorkspaceDockview(ctx)
      ? (Array.isArray(ctx.api.panels) ? ctx.api.panels.find(p => p.params?.panelId === panelId) : undefined)
      : ctx.api.getPanel(panelId);
    if (existingPanel) {
      existingPanel.api.setActive();
    }
    return;
  }

  if (isWorkspaceDockview(ctx)) {
    ctx.api.addPanel({
      id: `${panelId}-panel-${Date.now()}`,
      component: 'panel',
      params: { panelId },
      title: panelTitle,
      position: { direction: 'right' },
    });
    return;
  }

  ctx.api.addPanel({
    id: panelId,
    component: panelId,
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
  visible: (ctx) => !!ctx.api,
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
          disabled: () => isPanelOpen(ctx, panel.id) ? 'Already open' : false,
          execute: () => addPanel(ctx, panel.id),
        })),
        execute: () => {},
      });
    }

    return categoryActions;
  },
  execute: () => {}, // Parent doesn't execute
};

/**
 * Quick add common panels (shown at top level for convenience)
 */
export const quickAddActions: MenuAction[] = [
  {
    id: 'panel:quick-add:gallery',
    label: 'Add Gallery',
    icon: 'image',
    category: 'quick-add',
    availableIn: ['background'],
    visible: (ctx) => !!ctx.api && !isPanelOpen(ctx, 'gallery'),
    execute: (ctx) => addPanel(ctx, 'gallery'),
  },
  {
    id: 'panel:quick-add:inspector',
    label: 'Add Inspector',
    icon: 'info',
    category: 'quick-add',
    availableIn: ['background'],
    visible: (ctx) => !!ctx.api && !isPanelOpen(ctx, 'inspector'),
    execute: (ctx) => addPanel(ctx, 'inspector'),
  },
];

/**
 * All add panel actions
 */
export const addPanelActions: MenuAction[] = [
  addPanelAction,
  ...quickAddActions,
];
