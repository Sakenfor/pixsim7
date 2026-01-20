/**
 * Plugin Adapter for Capability Registration
 *
 * Provides a controlled, safe API for plugins to register capabilities
 * without direct access to the capability store. Enforces permissions
 * and scoping.
 *
 * Usage:
 * ```typescript
 * const adapter = createPluginCapabilityAdapter('my-plugin', ['ui:overlay']);
 * adapter.registerFeature({ ... });
 * adapter.cleanup(); // When plugin is disabled
 * ```
 */

import type { ActionDefinition } from '@pixsim7/shared.types';

import { debugFlags } from '@lib/utils/debugFlags';
import { logEvent } from '@lib/utils/logging';

import type { PluginPermission } from '../plugins/types';

import type {
  FeatureCapability,
  RouteCapability,
  StateCapability,
} from './index';
import {
  registerAction,
  registerFeature,
  registerRoute,
  registerState,
  toActionCapability,
  unregisterAction,
  unregisterFeature,
  unregisterRoute,
  unregisterState,
} from './index';

/**
 * Simplified types for plugin registration.
 * Actions use ActionDefinition from @pixsim7/shared.types.
 */
export interface PluginFeatureRegistration {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: 'creation' | 'editing' | 'viewing' | 'management' | 'utility' | 'game';
  priority?: number;
}

export interface PluginRouteRegistration {
  path: string;
  name: string;
  description?: string;
  icon?: string;
  showInNav?: boolean;
}

export interface PluginStateRegistration {
  id: string;
  name: string;
  getValue: () => any;
  subscribe?: (callback: (value: any) => void) => () => void;
  readonly?: boolean;
}

/**
 * Plugin capability adapter
 * Tracks all registrations and allows bulk cleanup
 */
export class PluginCapabilityAdapter {
  private pluginId: string;
  private permissions: Set<PluginPermission>;
  private registeredFeatureIds = new Set<string>();
  private registeredRoutes = new Set<string>();
  private registeredActionIds = new Set<string>();
  private registeredStateIds = new Set<string>();

  constructor(pluginId: string, permissions: PluginPermission[]) {
    this.pluginId = pluginId;
    this.permissions = new Set(permissions);
  }

  /**
   * Register a feature
   * Automatically prefixes feature ID with plugin ID
   */
  registerFeature(feature: PluginFeatureRegistration): void {
    // Prefix feature ID with plugin ID to avoid conflicts
    const fullId = `plugin.${this.pluginId}.${feature.id}`;

    const capability: FeatureCapability = {
      ...feature,
      id: fullId,
      enabled: () => true,
      metadata: {
        pluginId: this.pluginId,
        pluginProvided: true,
      },
    };

    registerFeature(capability);
    this.registeredFeatureIds.add(fullId);

    debugFlags.log('registry', `[PluginAdapter] Registered feature: ${fullId} (plugin: ${this.pluginId})`);
    logEvent('DEBUG', 'plugin_feature_registered', { featureId: fullId, pluginId: this.pluginId });
  }

  /**
   * Register a route
   * Requires ui:overlay permission
   */
  registerRoute(route: PluginRouteRegistration, featureId?: string): void {
    if (!this.permissions.has('ui:overlay')) {
      throw new Error(
        `Plugin ${this.pluginId} lacks 'ui:overlay' permission to register routes`
      );
    }

    const capability: RouteCapability = {
      ...route,
      protected: true, // All plugin routes require auth by default
      featureId: featureId ? `plugin.${this.pluginId}.${featureId}` : undefined,
    };

    registerRoute(capability);
    this.registeredRoutes.add(route.path);

    debugFlags.log('registry', `[PluginAdapter] Registered route: ${route.path} (plugin: ${this.pluginId})`);
    logEvent('DEBUG', 'plugin_route_registered', { path: route.path, pluginId: this.pluginId });
  }

  /**
   * Register an action
   * Actions are sandboxed - execute function can't access internals directly
   */
  registerAction(action: ActionDefinition): void {
    const prefix = `plugin.${this.pluginId}.`;

    if (action.id.startsWith(prefix)) {
      throw new Error(
        `Plugin action id should be local (without prefix): ${action.id}`
      );
    }

    if (action.id.startsWith('plugin.')) {
      throw new Error(
        `Plugin action id uses reserved prefix 'plugin.': ${action.id}`
      );
    }

    if (action.featureId.startsWith(prefix)) {
      throw new Error(
        `Plugin action featureId should be local (without prefix): ${action.featureId}`
      );
    }

    if (action.featureId.startsWith('plugin.')) {
      throw new Error(
        `Plugin action featureId uses reserved prefix 'plugin.': ${action.featureId}`
      );
    }

    const fullId = `${prefix}${action.id}`;
    const fullFeatureId = `${prefix}${action.featureId}`;

    const prefixedAction: ActionDefinition = {
      ...action,
      id: fullId,
      featureId: fullFeatureId,
    };

    registerAction(toActionCapability(prefixedAction));
    this.registeredActionIds.add(fullId);

    debugFlags.log('registry', `[PluginAdapter] Registered action: ${fullId} (plugin: ${this.pluginId})`);
    logEvent('DEBUG', 'plugin_action_registered', { actionId: fullId, pluginId: this.pluginId });
  }

  /**
   * Register a state accessor
   * State is read-only for plugins by default
   */
  registerState(state: PluginStateRegistration): void {
    // Prefix state ID with plugin ID
    const fullId = `plugin.${this.pluginId}.${state.id}`;

    const capability: StateCapability = {
      ...state,
      id: fullId,
      readonly: true, // Always readonly for plugin-provided state
    };

    registerState(capability);
    this.registeredStateIds.add(fullId);

    console.log(`[PluginAdapter] Registered state: ${fullId} (plugin: ${this.pluginId})`);
  }

  /**
   * Cleanup all registrations
   * Call this when plugin is disabled/uninstalled
   */
  cleanup(): void {
    // Unregister features
    this.registeredFeatureIds.forEach((id) => {
      unregisterFeature(id);
    });

    // Unregister routes
    this.registeredRoutes.forEach((path) => {
      unregisterRoute(path);
    });

    // Unregister actions
    this.registeredActionIds.forEach((id) => {
      unregisterAction(id);
    });

    // Unregister states
    this.registeredStateIds.forEach((id) => {
      unregisterState(id);
    });

    // Clear tracking sets
    this.registeredFeatureIds.clear();
    this.registeredRoutes.clear();
    this.registeredActionIds.clear();
    this.registeredStateIds.clear();

    console.log(`[PluginAdapter] Cleaned up all registrations for plugin: ${this.pluginId}`);
  }

  /**
   * Get plugin ID
   */
  getPluginId(): string {
    return this.pluginId;
  }

  /**
   * Check if plugin has permission
   */
  hasPermission(permission: PluginPermission): boolean {
    return this.permissions.has(permission);
  }
}

/**
 * Factory function to create a plugin capability adapter
 */
export function createPluginCapabilityAdapter(
  pluginId: string,
  permissions: PluginPermission[]
): PluginCapabilityAdapter {
  return new PluginCapabilityAdapter(pluginId, permissions);
}
