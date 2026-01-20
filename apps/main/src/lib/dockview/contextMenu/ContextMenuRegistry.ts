/**
 * Context Menu Registry
 *
 * Registry for dockview context menu actions.
 * Extends BaseRegistry with context-aware filtering and MenuItem conversion.
 */

import type { ActionContext, ActionDefinition } from '@pixsim7/shared.types';

import { capabilityRegistry, type ActionCapability } from '@lib/capabilities';
import { BaseRegistry } from '@lib/core/BaseRegistry';

import { toMenuActions, type ToMenuActionOptions } from './actionAdapters';
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

function isContextMenuCapable(action: ActionCapability, forceInclude: boolean): boolean {
  const contexts = action.contextMenu?.availableIn ?? action.contexts;
  if (!forceInclude && (!contexts || contexts.length === 0)) {
    return false;
  }

  if (action.visibility === 'hidden' || action.visibility === 'commandPalette') {
    return false;
  }

  return true;
}

function toActionContext(ctx: MenuActionContext) {
  return {
    source: 'contextMenu' as const,
    event: undefined,
    target: ctx,
  };
}

function wrapVisible(
  fn?: (ctx?: ActionContext) => boolean
): ((ctx: MenuActionContext) => boolean) | undefined {
  if (!fn) return undefined;
  return (ctx) => !!fn(toActionContext(ctx));
}

function wrapDisabled(
  fn?: (ctx?: ActionContext) => boolean | string
): ((ctx: MenuActionContext) => boolean | string) | undefined {
  if (!fn) return undefined;
  return (ctx) => {
    const result = fn(toActionContext(ctx));
    return result ?? false;
  };
}

function toMenuActionFromCapability(
  action: ActionCapability,
  options?: ToMenuActionOptions
): MenuAction {
  const availableIn =
    (action.contextMenu?.availableIn as ContextMenuContext[] | undefined) ??
    (action.contexts as ContextMenuContext[] | undefined);
  const visible = options?.visible ?? wrapVisible(action.contextMenu?.visible);
  const disabled = options?.disabled ?? wrapDisabled(action.contextMenu?.disabled);

  return {
    id: action.id,
    label: action.name,
    icon: action.icon,
    iconColor: options?.iconColor ?? action.contextMenu?.iconColor,
    shortcut: action.shortcut,
    category: options?.category ?? action.contextMenu?.category ?? action.category,
    variant: options?.variant ?? action.contextMenu?.variant,
    divider: options?.divider ?? action.contextMenu?.divider,
    availableIn: options?.availableIn ?? availableIn ?? ['item'],
    visible,
    disabled: disabled ?? (action.enabled ? () => !action.enabled!() : undefined),
    execute: (ctx) => {
      return action.execute(toActionContext(ctx));
    },
  };
}

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
  private includeCapabilityActions = true;
  private capabilityActionIds = new Set<string>();
  private capabilityOverrides = new Map<string, ToMenuActionOptions>();

  /**
   * Enable or disable auto-inclusion of capability actions.
   */
  setIncludeCapabilityActions(enabled: boolean): void {
    this.includeCapabilityActions = enabled;
    this.notifyListeners();
  }

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
    const registered = this.getAll();
    const registeredIds = new Set(registered.map((action) => action.id));
    const includeCapabilityActions =
      this.includeCapabilityActions || this.capabilityActionIds.size > 0;

    const capabilityActions = includeCapabilityActions
      ? capabilityRegistry.getAllActions()
          .filter((action) => {
            const forceInclude = this.capabilityActionIds.has(action.id);
            if (!this.includeCapabilityActions && !forceInclude) {
              return false;
            }
            if (!isContextMenuCapable(action, forceInclude)) {
              return false;
            }
            return !registeredIds.has(action.id);
          })
          .map((action) => {
            const overrides = this.capabilityOverrides.get(action.id);
            return toMenuActionFromCapability(action, overrides);
          })
      : [];

    return [...registered, ...capabilityActions]
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
    defaultOptions?: ToMenuActionOptions
  ): void {
    const menuActions = toMenuActions(actions, defaultOptions);
    this.registerAll(menuActions);
  }

  /**
   * Register actions from the capability registry by ID.
   *
   * Useful for adding context menu entries without duplicating metadata.
   * This stores overrides that are applied when capability actions are
   * converted into menu actions.
   *
   * @param actionIds - Action IDs from the capability registry
   * @param options - Optional overrides for menu conversion
   *
   * @example
   * ```typescript
   * contextMenuRegistry.registerFromCapabilities(
   *   ['assets.open-gallery', 'assets.upload'],
   *   { availableIn: ['asset', 'asset-card'] }
   * );
   * ```
   */
  registerFromCapabilities(
    actionIds: string[],
    options?: {
      defaultOptions?: ToMenuActionOptions;
      actionOptions?: Record<string, ToMenuActionOptions>;
    }
  ): void {
    actionIds.forEach((id) => {
      this.capabilityActionIds.add(id);
      const mergedOptions = {
        ...(options?.defaultOptions ?? {}),
        ...(options?.actionOptions?.[id] ?? {}),
      };
      if (Object.keys(mergedOptions).length > 0) {
        this.capabilityOverrides.set(id, mergedOptions);
      } else {
        this.capabilityOverrides.delete(id);
      }
    });
    this.notifyListeners();
  }
}

/**
 * Global singleton context menu registry
 */
export const contextMenuRegistry = new ContextMenuRegistry();
