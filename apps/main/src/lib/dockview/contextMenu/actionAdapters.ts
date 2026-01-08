/**
 * Action Adapters
 *
 * Converts canonical ActionDefinition to context menu's MenuAction format.
 * Used for opt-in adoption of module-defined actions in context menus.
 */

import type { ActionDefinition } from '@shared/types';

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
  // Determine availableIn from action.contexts or options or default
  const availableIn: ContextMenuContext[] =
    options?.availableIn ??
    (action.contexts as ContextMenuContext[]) ??
    ['item'];

  return {
    id: action.id,
    label: action.title,
    icon: action.icon,
    iconColor: options?.iconColor,
    category: options?.category ?? action.category,
    variant: options?.variant,
    shortcut: action.shortcut,
    divider: options?.divider,
    availableIn,
    visible: options?.visible,
    disabled: options?.disabled ?? (action.enabled ? () => !action.enabled!() : undefined),
    execute: (ctx) => {
      // Convert MenuActionContext to ActionContext
      const actionCtx = {
        source: 'contextMenu' as const,
        event: undefined, // MenuActionContext doesn't expose the original event
        target: ctx,
      };
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
