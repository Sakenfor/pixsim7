/**
 * Context Menu Registry
 *
 * Registry for dockview context menu actions.
 * Extends BaseRegistry with context-aware filtering and MenuItem conversion.
 */

import { BaseRegistry } from '@lib/core/BaseRegistry';
import type {
  MenuAction,
  MenuItem,
  ContextMenuContext,
  MenuActionContext,
} from './types';

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
   * Results are sorted by category and label.
   */
  getActionsForContext(
    contextType: ContextMenuContext,
    ctx: MenuActionContext
  ): MenuAction[] {
    return this.getAll()
      .filter(action => action.availableIn.includes(contextType))
      .filter(action => !action.visible || action.visible(ctx))
      .sort((a, b) => {
        // Sort by category first
        const catA = a.category || 'zzz';
        const catB = b.category || 'zzz';
        if (catA !== catB) return catA.localeCompare(catB);
        // Then by label
        return a.label.localeCompare(b.label);
      });
  }

  /**
   * Convert actions to MenuItem format for MenuWidget
   *
   * Recursively converts MenuAction tree to MenuItem tree.
   * Resolves dynamic children and evaluates disabled conditions.
   */
  toMenuItems(
    contextType: ContextMenuContext,
    ctx: MenuActionContext
  ): MenuItem[] {
    const actions = this.getActionsForContext(contextType, ctx);
    return actions.map(action => this.actionToMenuItem(action, ctx));
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
}

/**
 * Global singleton context menu registry
 */
export const contextMenuRegistry = new ContextMenuRegistry();
