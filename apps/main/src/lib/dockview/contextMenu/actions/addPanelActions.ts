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
  const allPanels = ctx.panelRegistry.getAll();

  for (const panel of allPanels) {
    const category = panel.category || 'Other';
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

/**
 * Check if a panel is already open in the current dockview
 */
function isPanelOpen(ctx: MenuActionContext, panelId: string): boolean {
  if (!ctx.api) return false;
  return ctx.api.panels.some(p => p.id === panelId);
}

/**
 * Add panel to the current dockview
 */
function addPanel(ctx: MenuActionContext, panelId: string) {
  if (!ctx.api) return;

  // Check if already open
  if (isPanelOpen(ctx, panelId)) {
    // Focus existing panel instead
    const existingPanel = ctx.api.getPanel(panelId);
    if (existingPanel) {
      existingPanel.api.setActive();
    }
    return;
  }

  // Add new panel
  ctx.api.addPanel({
    id: panelId,
    component: panelId,
    title: panelId, // Will be overridden by panel component
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
  availableIn: ['background', 'tab'],
  visible: (ctx) => !!ctx.api && !!ctx.panelRegistry,
  children: (ctx) => {
    const categories = getPanelsByCategory(ctx);

    if (categories.size === 0) {
      return [{
        id: 'panel:add:empty',
        label: 'No panels available',
        availableIn: ['background'],
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
      // If only one category, flatten the menu
      if (categories.size === 1) {
        return panels.map(panel => ({
          id: `panel:add:${panel.id}`,
          label: panel.title,
          icon: panel.icon,
          availableIn: ['background', 'tab'] as const,
          disabled: () => isPanelOpen(ctx, panel.id) ? 'Already open' : false,
          execute: () => addPanel(ctx, panel.id),
        }));
      }

      // Create category submenu
      categoryActions.push({
        id: `panel:add:category:${category}`,
        label: category,
        availableIn: ['background', 'tab'],
        children: panels.map(panel => ({
          id: `panel:add:${panel.id}`,
          label: panel.title,
          icon: panel.icon,
          availableIn: ['background', 'tab'] as const,
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
