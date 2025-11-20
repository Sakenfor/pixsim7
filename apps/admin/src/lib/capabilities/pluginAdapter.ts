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

import type {
  FeatureCapability,
  RouteCapability,
  ActionCapability,
  StateCapability,
} from './index';
import { useCapabilityStore } from './index';
import type { PluginPermission } from '../plugins/types';

/**
 * Simplified types for plugin registration (no execute functions, etc.)
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

export interface PluginActionRegistration {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  execute: (...args: any[]) => void | Promise<void>;
  enabled?: () => boolean;
  category?: string;
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

    useCapabilityStore.getState().registerFeature(capability);
    this.registeredFeatureIds.add(fullId);

    console.log(`[PluginAdapter] Registered feature: ${fullId} (plugin: ${this.pluginId})`);
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

    useCapabilityStore.getState().registerRoute(capability);
    this.registeredRoutes.add(route.path);

    console.log(`[PluginAdapter] Registered route: ${route.path} (plugin: ${this.pluginId})`);
  }

  /**
   * Register an action
   * Actions are sandboxed - execute function can't access internals directly
   */
  registerAction(action: PluginActionRegistration, featureId?: string): void {
    // Prefix action ID with plugin ID
    const fullId = `plugin.${this.pluginId}.${action.id}`;

    const capability: ActionCapability = {
      ...action,
      id: fullId,
      featureId: featureId ? `plugin.${this.pluginId}.${featureId}` : undefined,
    };

    useCapabilityStore.getState().registerAction(capability);
    this.registeredActionIds.add(fullId);

    console.log(`[PluginAdapter] Registered action: ${fullId} (plugin: ${this.pluginId})`);
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

    useCapabilityStore.getState().registerState(capability);
    this.registeredStateIds.add(fullId);

    console.log(`[PluginAdapter] Registered state: ${fullId} (plugin: ${this.pluginId})`);
  }

  /**
   * Cleanup all registrations
   * Call this when plugin is disabled/uninstalled
   */
  cleanup(): void {
    const store = useCapabilityStore.getState();

    // Unregister features
    this.registeredFeatureIds.forEach((id) => {
      store.unregisterFeature(id);
    });

    // Unregister routes
    this.registeredRoutes.forEach((path) => {
      store.unregisterRoute(path);
    });

    // Unregister actions
    this.registeredActionIds.forEach((id) => {
      store.unregisterAction(id);
    });

    // Unregister states
    this.registeredStateIds.forEach((id) => {
      store.unregisterState(id);
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
