/**
 * Action Adapters
 *
 * Converts canonical ActionDefinition to context menu's MenuAction format.
 * Used for opt-in adoption of module-defined actions in context menus.
 */

import type { ActionContext, ActionDefinition } from '@shared/types';

import type { MenuAction, ContextMenuContext, MenuActionContext } from './types';

export type ToMenuActionOptions = {
  /** Override availableIn contexts (defaults to action.contexts or ['item']) */
  availableIn?: ContextMenuContext[];
  /** Override category (defaults to action.category) */
  category?: string;
  /** Action variant for styling */
  variant?: 'default' | 'danger' | 'success';
  /** Show divider after this item */
  divider?: boolean;
  /** Icon color class */
  iconColor?: string;
  /** Additional visibility condition */
  visible?: (ctx: MenuActionContext) => boolean;
  /** Disabled condition */
  disabled?: (ctx: MenuActionContext) => boolean | string;
};

export type MenuActionCapabilityOptions = {
  featureId: string;
  visibility?: ActionDefinition['visibility'];
  descriptions?: Record<string, string>;
  /** Skip menu actions with children unless explicitly included. */
  includeChildren?: boolean;
  /** Include top-level contexts on ActionDefinition (defaults to false). */
  includeContexts?: boolean;
  filter?: (action: MenuAction) => boolean;
};

export type MenuActionCapabilityMapping = {
  actionDefinitions: ActionDefinition[];
  actionIds: string[];
  actionOptions: Record<string, ToMenuActionOptions>;
};

function resolveMenuActionContext(ctx?: ActionContext): MenuActionContext | null {
  const target = ctx?.target;
  if (target && typeof target === 'object') {
    return target as MenuActionContext;
  }
  return null;
}

function toActionContext(ctx: MenuActionContext): ActionContext {
  return {
    source: 'contextMenu',
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

/**
 * Convert a canonical ActionDefinition to a MenuAction for context menus.
 *
 * This adapter allows module-defined actions to appear in context menus
 * without changing the existing MenuAction interface or registry.
 *
 * @param action - Canonical action definition
 * @param options - Additional context menu options
 * @returns MenuAction compatible with ContextMenuRegistry
 *
 * @example
 * ```typescript
 * const menuAction = toMenuAction(openGalleryAction, {
 *   availableIn: ['tab', 'panel-content'],
 *   category: 'navigation',
 * });
 * contextMenuRegistry.register(menuAction);
 * ```
 */
export function toMenuAction(
  action: ActionDefinition,
  options?: ToMenuActionOptions
): MenuAction {
  const contextMenu = action.contextMenu;

  // Determine availableIn from action.contexts or options or default
  const availableIn: ContextMenuContext[] =
    options?.availableIn ??
    (contextMenu?.availableIn as ContextMenuContext[] | undefined) ??
    (action.contexts as ContextMenuContext[] | undefined) ??
    ['item'];

  const visible = options?.visible ?? wrapVisible(contextMenu?.visible);
  const disabled = options?.disabled ?? wrapDisabled(contextMenu?.disabled);

  return {
    id: action.id,
    label: action.title,
    icon: action.icon,
    iconColor: options?.iconColor ?? contextMenu?.iconColor,
    category: options?.category ?? contextMenu?.category ?? action.category,
    variant: options?.variant ?? contextMenu?.variant,
    shortcut: action.shortcut,
    divider: options?.divider ?? contextMenu?.divider,
    availableIn,
    visible,
    disabled: disabled ?? (action.enabled ? () => !action.enabled!() : undefined),
    execute: (ctx) => {
      // Convert MenuActionContext to ActionContext
      const actionCtx = toActionContext(ctx);
      return action.execute(actionCtx);
    },
  };
}

/**
 * Convert multiple ActionDefinitions to MenuActions.
 *
 * @param actions - Array of canonical action definitions
 * @param defaultOptions - Options applied to all actions
 * @returns Array of MenuActions
 */
export function toMenuActions(
  actions: ActionDefinition[],
  defaultOptions?: ToMenuActionOptions
): MenuAction[] {
  return actions.map((action) => toMenuAction(action, defaultOptions));
}

/**
 * Convert MenuActions into ActionDefinitions with context menu overrides.
 */
export function menuActionsToCapabilityActions(
  actions: MenuAction[],
  options: MenuActionCapabilityOptions
): MenuActionCapabilityMapping {
  const includeChildren = options.includeChildren ?? false;
  const includeContexts = options.includeContexts ?? false;
  const filtered = actions.filter((action) => {
    if (!includeChildren && action.children) {
      return false;
    }
    if (options.filter && !options.filter(action)) {
      return false;
    }
    return true;
  });

  const actionDefinitions = filtered.map((action) => {
    const description = options.descriptions?.[action.id];
    const contextMenu = {
      availableIn: action.availableIn,
      category: action.category,
      variant: action.variant,
      divider: action.divider,
      iconColor: action.iconColor,
      visible: action.visible
        ? (ctx?: ActionContext) => {
            const menuCtx = resolveMenuActionContext(ctx);
            if (!menuCtx) return false;
            return action.visible!(menuCtx);
          }
        : undefined,
      disabled: action.disabled
        ? (ctx?: ActionContext) => {
            const menuCtx = resolveMenuActionContext(ctx);
            if (!menuCtx) return true;
            return action.disabled!(menuCtx);
          }
        : undefined,
    };

    const definition: ActionDefinition = {
      id: action.id,
      featureId: options.featureId,
      title: action.label,
      description,
      icon: action.icon,
      shortcut: action.shortcut,
      visibility: options.visibility ?? 'contextMenu',
      ...(includeContexts ? { contexts: action.availableIn } : {}),
      contextMenu,
      category: action.category,
      execute: (ctx) => {
        const menuCtx = resolveMenuActionContext(ctx);
        if (!menuCtx) return;
        return action.execute(menuCtx);
      },
    };

    return definition;
  });

  return {
    actionDefinitions,
    actionIds: actionDefinitions.map((action) => action.id),
    actionOptions: {},
  };
}
