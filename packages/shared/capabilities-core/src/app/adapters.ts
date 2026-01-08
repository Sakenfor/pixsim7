/**
 * Action Definition Adapters
 *
 * Converters for transforming ActionDefinition (from @pixsim7/types)
 * into AppActionCapability for the capability registry.
 */

import type { ActionDefinition } from '@pixsim7/shared.types';
import type { AppActionCapability } from './types';

/**
 * Convert an ActionDefinition to an AppActionCapability.
 *
 * This adapter allows module-defined actions (using the canonical ActionDefinition)
 * to be registered with the capability store without ad-hoc conversions.
 *
 * @param action - Canonical ActionDefinition from module page.actions
 * @returns AppActionCapability for registration with registerAction
 *
 * @example
 * ```typescript
 * import { toAppActionCapability } from '@pixsim7/capabilities-core/app';
 *
 * const capability = toAppActionCapability(openGalleryAction);
 * registerAction(capability);
 * ```
 */
export function toAppActionCapability(action: ActionDefinition): AppActionCapability {
  return {
    id: action.id,
    name: action.title,
    description: action.description,
    icon: action.icon,
    shortcut: action.shortcut,
    route: action.route,
    featureId: action.featureId,
    category: action.category,
    tags: action.tags,
    enabled: action.enabled,
    visibility: action.visibility,
    contexts: action.contexts,
    execute: action.execute,
  };
}
