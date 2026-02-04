/**
 * Context Menu Registry (shared, app-agnostic)
 *
 * Extends BaseRegistry with context-aware filtering and MenuItem conversion.
 * Capability actions are injected via setCapabilitySource() rather than
 * directly importing from app-specific modules.
 */

import type { ActionContext, ActionDefinition } from '@pixsim7/shared.types';

import { BaseRegistry } from './BaseRegistry';
import { toMenuActions, type ToMenuActionOptions } from './actionAdapters';
import type {
  ContextMenuContext,
  MenuActionBase,
  MenuActionContextBase,
  MenuItem,
  CapabilityActionSource,
  CapabilityActionLike,
} from './types';

const CATEGORY_PRIORITY: Record<string, number> = {
  'asset': 5,
  'generation': 10,
  'panel': 15,
  'quick-add': 18,
  'add': 20,
  'layout': 25,
  'preset': 30,
  'connect': 40,
  'zzz': 100,
};

function isContextMenuCapable(action: CapabilityActionLike, forceInclude: boolean): boolean {
  const contexts = action.contextMenu?.availableIn ?? action.contexts;
  if (!forceInclude && (!contexts || contexts.length === 0)) {
    return false;
  }
  if (action.visibility === 'hidden' || action.visibility === 'commandPalette') {
    return false;
  }
  return true;
}

function toActionContext(ctx: MenuActionContextBase) {
  return {
    source: 'contextMenu' as const,
    event: undefined,
    target: ctx,
  };
}

function wrapVisible(
  fn?: (ctx?: ActionContext) => boolean
): ((ctx: MenuActionContextBase) => boolean) | undefined {
  if (!fn) return undefined;
  return (ctx) => !!fn(toActionContext(ctx));
}

function wrapDisabled(
  fn?: (ctx?: ActionContext) => boolean | string
): ((ctx: MenuActionContextBase) => boolean | string) | undefined {
  if (!fn) return undefined;
  return (ctx) => {
    const result = fn(toActionContext(ctx));
    return result ?? false;
  };
}

function toMenuActionFromCapability(
  action: CapabilityActionLike,
  options?: ToMenuActionOptions
): MenuActionBase {
  const availableIn =
    (action.contextMenu?.availableIn as ContextMenuContext[] | undefined) ??
    (action.contexts as ContextMenuContext[] | undefined);
  const visible = options?.visible ?? wrapVisible(action.contextMenu?.visible as any);
  const disabled = options?.disabled ?? wrapDisabled(action.contextMenu?.disabled as any);

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

function getCategoryPriority(category: string | undefined): number {
  if (!category) return 50;
  return CATEGORY_PRIORITY[category] ?? 50;
}

export class ContextMenuRegistry extends BaseRegistry<MenuActionBase> {
  private includeCapabilityActions = true;
  private capabilityFilteringEnabled = true;
  private capabilityActionIds = new Set<string>();
  private capabilityOverrides = new Map<string, ToMenuActionOptions>();
  private capabilitySource: CapabilityActionSource | null = null;

  /**
   * Inject the capability action source.
   * Called during app initialization to wire app-specific capabilities.
   */
  setCapabilitySource(source: CapabilityActionSource): void {
    this.capabilitySource = source;
  }

  setIncludeCapabilityActions(enabled: boolean): void {
    this.includeCapabilityActions = enabled;
    this.notifyListeners();
  }

  /**
   * Enable/disable capability-based filtering (requiredCapabilities).
   * When disabled, actions with requiredCapabilities are shown regardless of context.
   * Useful for debugging or when capability system isn't fully set up.
   */
  setCapabilityFilteringEnabled(enabled: boolean): void {
    this.capabilityFilteringEnabled = enabled;
    this.notifyListeners();
  }

  getCapabilityFilteringEnabled(): boolean {
    return this.capabilityFilteringEnabled;
  }

  getActionsForContext(
    contextType: ContextMenuContext,
    ctx: MenuActionContextBase
  ): MenuActionBase[] {
    const registered = this.getAll();
    const registeredIds = new Set(registered.map((action) => action.id));
    const includeCapabilityActions =
      this.includeCapabilityActions || this.capabilityActionIds.size > 0;

    const capabilityActions = (includeCapabilityActions && this.capabilitySource)
      ? this.capabilitySource.getAllActions()
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
      .filter(action => this.isActionAvailableInContext(action, contextType, ctx))
      .filter(action => !action.visible || action.visible(ctx))
      .sort((a, b) => {
        const priorityA = getCategoryPriority(a.category);
        const priorityB = getCategoryPriority(b.category);
        if (priorityA !== priorityB) return priorityA - priorityB;
        return a.label.localeCompare(b.label);
      });
  }

  toMenuItems(
    contextType: ContextMenuContext,
    ctx: MenuActionContextBase
  ): MenuItem[] {
    const actions = this.getActionsForContext(contextType, ctx);
    const items: MenuItem[] = [];
    let lastCategory: string | undefined;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const currentCategory = action.category;

      const shouldAddDivider = i > 0 && lastCategory !== currentCategory;

      const menuItem = this.actionToMenuItem(action, ctx);

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
   * Check if an action is available in the given context.
   * Supports both availableIn (explicit context list) and requiredCapabilities (capability-based).
   *
   * Uses OR logic when both are specified:
   * - Action appears if context type is in availableIn, OR
   * - Action appears if all requiredCapabilities are present
   *
   * This allows gradual migration from availableIn to requiredCapabilities.
   */
  private isActionAvailableInContext(
    action: MenuActionBase,
    contextType: ContextMenuContext,
    ctx: MenuActionContextBase
  ): boolean {
    const hasAvailableIn = action.availableIn && action.availableIn.length > 0;
    const hasRequiredCaps = action.requiredCapabilities && action.requiredCapabilities.length > 0;

    // If neither is specified, action is not available
    if (!hasAvailableIn && !hasRequiredCaps) {
      return false;
    }

    // Check availableIn - if specified and matches, action is available
    if (hasAvailableIn && action.availableIn!.includes(contextType)) {
      return true;
    }

    // Check requiredCapabilities - if specified and all present, action is available
    // Skip capability check if filtering is disabled (for debugging)
    if (hasRequiredCaps) {
      if (!this.capabilityFilteringEnabled) {
        // When filtering disabled, treat requiredCapabilities as always satisfied
        return true;
      }
      const capabilities = ctx.capabilities ?? {};
      const hasAllCaps = action.requiredCapabilities!.every(
        cap => capabilities[cap] !== undefined
      );
      if (hasAllCaps) {
        return true;
      }
    }

    return false;
  }

  private actionToMenuItem(action: MenuActionBase, ctx: MenuActionContextBase): MenuItem {
    let disabled: boolean | string | undefined;
    if (action.disabled) {
      disabled = action.disabled(ctx);
    }

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

  registerAll(actions: MenuActionBase[]): void {
    actions.forEach(action => this.register(action));
  }

  registerFromDefinitions(
    actions: ActionDefinition[],
    defaultOptions?: ToMenuActionOptions
  ): void {
    const menuActions = toMenuActions(actions, defaultOptions);
    this.registerAll(menuActions);
  }

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

/** Global singleton context menu registry */
export const contextMenuRegistry = new ContextMenuRegistry();
