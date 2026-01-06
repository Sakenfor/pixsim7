/**
 * Context Menu Registry
 *
 * Registry for dockview context menu actions.
 * Extends BaseRegistry with context-aware filtering and MenuItem conversion.
 */

import type { ActionDefinition } from '@shared/types';

import { BaseRegistry } from '@lib/core/BaseRegistry';

import { toMenuAction, toMenuActions } from './actionAdapters';
import type {
  MenuAction,
  MenuItem,
  ContextMenuContext,
  MenuActionContext,
} from './types';

/**
 * Category priority order for context menu actions.
 * Lower numbers appear first. Categories not in this list get priority 50.
 */
const CATEGORY_PRIORITY: Record<string, number> = {
  // Asset operations (when clicking on assets)
  'asset': 5,
  'generation': 10,

  // Panel operations (most common)
  'panel': 15,
  'quick-add': 18,
  'add': 20,

  // Layout operations
  'layout': 25,

  // Preset/workspace operations
  'preset': 30,

  // Connection/capability operations (advanced)
  'connect': 40,

  // Always last - properties/info/debug
  'zzz': 100,
};

/**
 * Get priority for a category. Lower is higher priority.
 */
function getCategoryPriority(category: string | undefined): number {
  if (!category) return 50;
  return CATEGORY_PRIORITY[category] ?? 50;
}

/**
 * Registry for context menu actions
 *
 * Manages registration and retrieval of context menu actions.
 * Actions are filtered based on context type and visibility conditions.
 */
export class ContextMenuRegistry extends BaseRegistry<MenuAction> {
  /**
   * Get actions available for a specific context
   *
   * Filters actions by:
   * 1. Context type (tab, group, panel-content, background)
   * 2. Visibility condition (if defined)
   *
   * Results are sorted by category priority and then by label.
   */
  getActionsForContext(
    contextType: ContextMenuContext,
    ctx: MenuActionContext
  ): MenuAction[] {
    return this.getAll()
      .filter(action => action.availableIn.includes(contextType))
      .filter(action => !action.visible || action.visible(ctx))
      .sort((a, b) => {
        // Sort by category priority first
        const priorityA = getCategoryPriority(a.category);
        const priorityB = getCategoryPriority(b.category);
        if (priorityA !== priorityB) return priorityA - priorityB;
        // Then by label within category
        return a.label.localeCompare(b.label);
      });
  }

  /**
   * Convert actions to MenuItem format for MenuWidget
   *
   * Recursively converts MenuAction tree to MenuItem tree.
   * Resolves dynamic children and evaluates disabled conditions.
   * Automatically adds dividers between different categories.
   */
  toMenuItems(
    contextType: ContextMenuContext,
    ctx: MenuActionContext
  ): MenuItem[] {
    const actions = this.getActionsForContext(contextType, ctx);
    const items: MenuItem[] = [];
    let lastCategory: string | undefined;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const currentCategory = action.category;

      // Add divider before this item if category changed (except for first item)
      const shouldAddDivider = i > 0 && lastCategory !== currentCategory;

      const menuItem = this.actionToMenuItem(action, ctx);

      // If we need a divider and this item doesn't already have one from the action,
      // add it to the previous item
      if (shouldAddDivider && items.length > 0 && !items[items.length - 1].divider) {
        items[items.length - 1] = {
          ...items[items.length - 1],
          divider: true,
        };
      }

      items.push(menuItem);
      lastCategory = currentCategory;
    }

    return items;
  }

  /**
   * Convert a single action to MenuItem (recursive)
   */
  private actionToMenuItem(action: MenuAction, ctx: MenuActionContext): MenuItem {
    // Evaluate disabled condition
    let disabled: boolean | string | undefined;
    if (action.disabled) {
      disabled = action.disabled(ctx);
    }

    // Resolve children (can be static array or dynamic function)
    let children: MenuItem[] | undefined;
    if (action.children) {
      const childActions = typeof action.children === 'function'
        ? action.children(ctx)
        : action.children;
      children = childActions.map(child => this.actionToMenuItem(child, ctx));
    }

    return {
      id: action.id,
      label: action.label,
      icon: action.icon,
      iconColor: action.iconColor,
      variant: action.variant,
      shortcut: action.shortcut,
      divider: action.divider,
      disabled,
      children,
      onClick: () => action.execute(ctx),
    };
  }

  /**
   * Register multiple actions at once
   */
  registerAll(actions: MenuAction[]): void {
    actions.forEach(action => this.register(action));
  }

  /**
   * Register actions from canonical ActionDefinition format.
   *
   * This allows module-defined actions to be added to the context menu
   * using the shared ActionDefinition type. The adapter converts them
   * to MenuAction format automatically.
   *
   * @param actions - Array of ActionDefinition from module page.actions
   * @param defaultOptions - Options applied to all converted actions
   *
   * @example
   * ```typescript
   * contextMenuRegistry.registerFromDefinitions(
   *   [openGalleryAction, uploadAction],
   *   { availableIn: ['asset', 'asset-card'] }
   * );
   * ```
   */
  registerFromDefinitions(
    actions: ActionDefinition[],
    defaultOptions?: Parameters<typeof toMenuAction>[1]
  ): void {
    const menuActions = toMenuActions(actions, defaultOptions);
    this.registerAll(menuActions);
  }
}

/**
 * Global singleton context menu registry
 */
export const contextMenuRegistry = new ContextMenuRegistry();
