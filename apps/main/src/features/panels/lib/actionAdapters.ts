/**
 * Panel Action Adapters
 *
 * Converts canonical ActionDefinition to panel's PanelAction format.
 * Used for opt-in adoption of module-defined actions in panel action registries.
 */

import type { CubeFace } from '@pixsim7/pixcubes';
import type { ActionDefinition } from '@pixsim7/shared.types';

import type { PanelAction } from './actions';

/**
 * Options for converting an ActionDefinition to a PanelAction.
 */
export interface ToPanelActionOptions {
  /** Preferred cube face placement for the action */
  face?: CubeFace;
  /** Custom error handler */
  onError?: (error: Error) => void;
}

/**
 * Convert a canonical ActionDefinition to a PanelAction.
 *
 * This adapter allows module-defined actions to be used in panel action registries
 * without changing the existing PanelAction interface.
 *
 * @param action - Canonical action definition
 * @param options - Panel-specific options (face placement, error handling)
 * @returns PanelAction compatible with PanelActionRegistry
 *
 * @example
 * ```typescript
 * const panelAction = toPanelAction(refreshAction, { face: 'top' });
 * panelActionRegistry.register({
 *   panelId: 'my-panel',
 *   panelName: 'My Panel',
 *   actions: [panelAction],
 * });
 * ```
 */
export function toPanelAction(
  action: ActionDefinition,
  options?: ToPanelActionOptions
): PanelAction {
  return {
    id: action.id,
    label: action.title,
    icon: action.icon ?? 'circle', // PanelAction requires icon
    description: action.description,
    shortcut: action.shortcut,
    face: options?.face,
    enabled: action.enabled,
    onError: options?.onError,
    execute: () => {
      // Convert to ActionContext for the execute call
      const actionCtx = {
        source: 'programmatic' as const,
        event: undefined,
        target: undefined,
      };
      return action.execute(actionCtx);
    },
  };
}

/**
 * Convert multiple ActionDefinitions to PanelActions.
 *
 * @param actions - Array of canonical action definitions
 * @param defaultOptions - Options applied to all actions
 * @returns Array of PanelActions
 */
export function toPanelActions(
  actions: ActionDefinition[],
  defaultOptions?: ToPanelActionOptions
): PanelAction[] {
  return actions.map((action) => toPanelAction(action, defaultOptions));
}
