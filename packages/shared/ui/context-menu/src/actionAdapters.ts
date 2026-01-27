/**
 * Action Adapters
 *
 * Converts canonical ActionDefinition to context menu's MenuAction format.
 */

import type { ActionContext, ActionDefinition } from '@pixsim7/shared.types';

import type { ContextMenuContext, MenuActionBase, MenuActionContextBase } from '@pixsim7/shared.ui.panels';

export type ToMenuActionOptions = {
  availableIn?: ContextMenuContext[];
  category?: string;
  variant?: 'default' | 'danger' | 'success';
  divider?: boolean;
  iconColor?: string;
  visible?: (ctx: MenuActionContextBase) => boolean;
  disabled?: (ctx: MenuActionContextBase) => boolean | string;
};

export type MenuActionCapabilityOptions = {
  featureId: string;
  visibility?: ActionDefinition['visibility'];
  descriptions?: Record<string, string>;
  includeChildren?: boolean;
  includeContexts?: boolean;
  filter?: (action: MenuActionBase) => boolean;
};

export type MenuActionCapabilityMapping = {
  actionDefinitions: ActionDefinition[];
  actionIds: string[];
  actionOptions: Record<string, ToMenuActionOptions>;
};

function resolveMenuActionContext(ctx?: ActionContext): MenuActionContextBase | null {
  const target = ctx?.target;
  if (target && typeof target === 'object') {
    return target as MenuActionContextBase;
  }
  return null;
}

function toActionContext(ctx: MenuActionContextBase): ActionContext {
  return {
    source: 'contextMenu',
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

export function toMenuAction(
  action: ActionDefinition,
  options?: ToMenuActionOptions
): MenuActionBase {
  const contextMenu = action.contextMenu;

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
      const actionCtx = toActionContext(ctx);
      return action.execute(actionCtx);
    },
  };
}

export function toMenuActions(
  actions: ActionDefinition[],
  defaultOptions?: ToMenuActionOptions
): MenuActionBase[] {
  return actions.map((action) => toMenuAction(action, defaultOptions));
}

export function menuActionsToCapabilityActions(
  actions: MenuActionBase[],
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
