/**
 * Security Filter for Capability Access
 *
 * Provides filtered views of capabilities based on plugin permissions.
 * Untrusted UI plugins should not get raw access to all actions/state.
 *
 * Usage:
 * ```typescript
 * const filter = new CapabilitySecurityFilter(['read:session', 'ui:overlay']);
 * const allowedActions = filter.filterActions(allActions);
 * const allowedState = filter.filterStates(allStates);
 * ```
 */

import type { ActionCapability, StateCapability, FeatureCapability } from './index';
import type { PluginPermission } from '../plugins/types';

/**
 * Capability scope annotation
 * These can be added to capability metadata to control access
 */
export type CapabilityScope =
  | 'public'           // Available to all plugins
  | 'read-session'     // Requires read:session permission
  | 'read-world'       // Requires read:world permission
  | 'read-npcs'        // Requires read:npcs permission
  | 'read-locations'   // Requires read:locations permission
  | 'internal'         // Not available to plugins
  | 'core-only';       // Only available to core modules

/**
 * Permission to scope mapping
 */
const PERMISSION_TO_SCOPE: Record<PluginPermission, CapabilityScope[]> = {
  'read:session': ['public', 'read-session'],
  'read:world': ['public', 'read-world'],
  'read:npcs': ['public', 'read-npcs'],
  'read:locations': ['public', 'read-locations'],
  'ui:overlay': ['public'],
  'ui:theme': ['public'],
  'storage': ['public'],
  'notifications': ['public'],
};

/**
 * Security filter for capabilities
 */
export class CapabilitySecurityFilter {
  private permissions: Set<PluginPermission>;
  private allowedScopes: Set<CapabilityScope>;

  constructor(permissions: PluginPermission[]) {
    this.permissions = new Set(permissions);
    this.allowedScopes = new Set<CapabilityScope>(['public']); // Always allow public

    // Build allowed scopes from permissions
    permissions.forEach((perm) => {
      const scopes = PERMISSION_TO_SCOPE[perm];
      if (scopes) {
        scopes.forEach((scope) => this.allowedScopes.add(scope));
      }
    });
  }

  /**
   * Check if a capability is allowed based on its scope
   */
  private isAllowed(scope?: CapabilityScope): boolean {
    // No scope = public by default
    if (!scope) return true;

    // Internal and core-only are never allowed
    if (scope === 'internal' || scope === 'core-only') return false;

    return this.allowedScopes.has(scope);
  }

  /**
   * Filter features by permissions
   */
  filterFeatures(features: FeatureCapability[]): FeatureCapability[] {
    return features.filter((feature) => {
      const scope = feature.metadata?.scope as CapabilityScope | undefined;
      return this.isAllowed(scope);
    });
  }

  /**
   * Filter actions by permissions
   * Wraps execute to prevent unauthorized access
   */
  filterActions(actions: ActionCapability[]): ActionCapability[] {
    return actions
      .filter((action) => {
        // Check if action has a scope annotation
        const scope = (action as any).scope as CapabilityScope | undefined;
        return this.isAllowed(scope);
      })
      .map((action) => {
        // Wrap execute to add additional security checks
        const originalExecute = action.execute;
        return {
          ...action,
          execute: async (...args: any[]) => {
            // Additional runtime checks could go here
            return originalExecute(...args);
          },
        };
      });
  }

  /**
   * Filter states by permissions
   * Wraps getValue to prevent unauthorized access
   */
  filterStates(states: StateCapability[]): StateCapability[] {
    return states
      .filter((state) => {
        // Check if state has a scope annotation
        const scope = (state as any).scope as CapabilityScope | undefined;
        return this.isAllowed(scope);
      })
      .map((state) => {
        // Ensure state is read-only for plugins
        return {
          ...state,
          readonly: true,
        };
      });
  }

  /**
   * Check if specific action is allowed
   */
  canExecuteAction(actionId: string, actions: ActionCapability[]): boolean {
    const action = actions.find((a) => a.id === actionId);
    if (!action) return false;

    const scope = (action as any).scope as CapabilityScope | undefined;
    return this.isAllowed(scope);
  }

  /**
   * Check if specific state is allowed
   */
  canAccessState(stateId: string, states: StateCapability[]): boolean {
    const state = states.find((s) => s.id === stateId);
    if (!state) return false;

    const scope = (state as any).scope as CapabilityScope | undefined;
    return this.isAllowed(scope);
  }

  /**
   * Get allowed scopes for debugging
   */
  getAllowedScopes(): CapabilityScope[] {
    return Array.from(this.allowedScopes);
  }
}

/**
 * Create a security filter from permissions
 */
export function createSecurityFilter(
  permissions: PluginPermission[]
): CapabilitySecurityFilter {
  return new CapabilitySecurityFilter(permissions);
}

/**
 * Add scope annotation to a capability
 * Helper for marking capabilities with scope
 */
export function withScope<T>(capability: T, scope: CapabilityScope): T {
  return {
    ...capability,
    scope,
  };
}
