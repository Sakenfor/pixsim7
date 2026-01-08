/**
 * App Capability Registry
 *
 * Central system for exposing app features, routes, actions, and state
 * to UI plugins. Allows plugins to discover and integrate with app functionality
 * without hardcoding.
 *
 * Inspired by VS Code's extension API and Eclipse's contribution model.
 */

import {
  createAppCapabilityRegistry,
  toAppActionCapability,
  type AppActionCapability,
  type AppFeatureCapability,
  type AppRouteCapability,
  type AppStateCapability,
} from '@pixsim7/capabilities-core/app';
import { ActionDefinitionSchema } from '@shared/types';
import type {
  ActionContext,
  ActionDefinition,
} from '@shared/types';
import * as React from 'react';
import { debugFlags } from '@lib/utils/debugFlags';
import { logEvent } from '@lib/utils/logging';

// Re-export modules
export * from './routeConstants';
export * from './pluginAdapter';
export * from './securityFilter';

/**
 * App Capability Types
 * Derived from the shared core registry module.
 */
export type FeatureCapability = AppFeatureCapability;
export type RouteCapability = AppRouteCapability;
export type ActionCapability = AppActionCapability;
export type StateCapability<T = unknown> = AppStateCapability<T>;

/**
 * Convert an ActionDefinition to an ActionCapability.
 *
 * This adapter allows module-defined actions (using the canonical ActionDefinition)
 * to be registered with the capability store without ad-hoc conversions.
 *
 * @param action - Canonical ActionDefinition from module page.actions
 * @returns ActionCapability for registration with registerAction
 *
 * @example
 * ```typescript
 * import { toActionCapability } from '@lib/capabilities';
 *
 * const capability = toActionCapability(openGalleryAction);
 * registerAction(capability);
 * ```
 */
export function toActionCapability(action: ActionDefinition): ActionCapability {
  return toAppActionCapability(action);
}

function validateActionDefinition(action: ActionDefinition): void {
  const result = ActionDefinitionSchema.safeParse(action);
  if (result.success) {
    return;
  }

  const issues = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

  logEvent('WARNING', 'capability_action_validation_failed', {
    actionId: action.id,
    issues,
  });
}

/**
 * Register multiple ActionDefinitions with the capability store.
 *
 * Convenience function for bulk registration of module-defined actions.
 *
 * @param actions - Array of ActionDefinition from module page.actions
 *
 * @example
 * ```typescript
 * import { registerActionsFromDefinitions } from '@lib/capabilities';
 *
 * registerActionsFromDefinitions([openGalleryAction, uploadAssetAction]);
 * ```
 */
export function registerActionsFromDefinitions(actions: ActionDefinition[]): void {
  for (const action of actions) {
    validateActionDefinition(action);
    registerAction(toActionCapability(action));
  }
}

export const capabilityRegistry = createAppCapabilityRegistry({
  onDuplicateAction: (action) => {
    logEvent('WARNING', 'capability_action_overwritten', {
      actionId: action.id,
      newName: action.name,
      newFeatureId: action.featureId,
    });
  },
  onDuplicateFeature: (feature) => {
    logEvent('WARNING', 'capability_feature_overwritten', {
      featureId: feature.id,
      name: feature.name,
    });
  },
  onDuplicateRoute: (route) => {
    logEvent('WARNING', 'capability_route_overwritten', {
      path: route.path,
      name: route.name,
      featureId: route.featureId,
    });
  },
  onDuplicateState: (state) => {
    logEvent('WARNING', 'capability_state_overwritten', {
      stateId: state.id,
      name: state.name,
    });
  },
});

export function registerFeature(feature: FeatureCapability): void {
  capabilityRegistry.registerFeature(feature);
  debugFlags.log('registry', `[Capabilities] Registered feature: ${feature.name}`);
  logEvent('DEBUG', 'capability_feature_registered', { featureId: feature.id, name: feature.name });
}

export function unregisterFeature(id: string): void {
  capabilityRegistry.unregisterFeature(id);
}

export function registerRoute(route: RouteCapability): void {
  capabilityRegistry.registerRoute(route);
  debugFlags.log('registry', `[Capabilities] Registered route: ${route.path}`);
  logEvent('DEBUG', 'capability_route_registered', { path: route.path });
}

export function unregisterRoute(path: string): void {
  capabilityRegistry.unregisterRoute(path);
}

export function registerAction(action: ActionCapability): void {
  capabilityRegistry.registerAction(action);
  debugFlags.log('registry', `[Capabilities] Registered action: ${action.name}`);
  logEvent('DEBUG', 'capability_action_registered', { actionId: action.id, name: action.name });
}

export function unregisterAction(id: string): void {
  capabilityRegistry.unregisterAction(id);
}

export function registerState(state: StateCapability): void {
  capabilityRegistry.registerState(state);
  console.log(`[Capabilities] Registered state: ${state.name}`);
}

export function unregisterState(id: string): void {
  capabilityRegistry.unregisterState(id);
}

export function clearAllCapabilities(): void {
  capabilityRegistry.clearAll();
}

function useCapabilitySnapshot<T>(getSnapshot: () => T): T {
  return React.useSyncExternalStore(
    capabilityRegistry.subscribe,
    getSnapshot,
    getSnapshot
  );
}

/**
 * Hook to get all features
 */
export function useFeatures() {
  return useCapabilitySnapshot(() =>
    capabilityRegistry.getAllFeatures().filter(f => !f.enabled || f.enabled())
  );
}

/**
 * Hook to get a specific feature by ID
 */
export function useFeature(id: string) {
  return useCapabilitySnapshot(() => capabilityRegistry.getFeature(id));
}

/**
 * Hook to get features by category
 */
export function useFeaturesByCategory(category: string) {
  return useCapabilitySnapshot(() =>
    capabilityRegistry.getFeaturesByCategory(category).filter(f => !f.enabled || f.enabled())
  );
}

/**
 * Hook to get all routes
 */
export function useRoutes() {
  return useCapabilitySnapshot(() => capabilityRegistry.getAllRoutes());
}

/**
 * Hook to get routes for a specific feature
 */
export function useFeatureRoutes(featureId: string) {
  return useCapabilitySnapshot(() => capabilityRegistry.getRoutesForFeature(featureId));
}

/**
 * Hook to get navigation routes (showInNav = true)
 */
export function useNavRoutes() {
  return useCapabilitySnapshot(() =>
    capabilityRegistry.getAllRoutes().filter(r => r.showInNav)
  );
}

/**
 * Hook to get all actions
 */
export function useActions() {
  return useCapabilitySnapshot(() =>
    capabilityRegistry.getAllActions().filter(a => !a.enabled || a.enabled())
  );
}

/**
 * Hook to get a specific action by ID
 */
export function useAction(id: string) {
  return useCapabilitySnapshot(() => capabilityRegistry.getAction(id));
}

/**
 * Hook to get actions for a specific feature
 */
export function useFeatureActions(featureId: string) {
  const actions = useActions();
  return React.useMemo(
    () => actions.filter(action => action.featureId === featureId),
    [actions, featureId]
  );
}

/**
 * Hook to get all states
 */
export function useStates() {
  return useCapabilitySnapshot(() => capabilityRegistry.getAllStates());
}

/**
 * Hook to get a specific state capability by ID
 * Named useCapabilityState to avoid conflict with React's useState
 */
export function useCapabilityState(id: string) {
  return useCapabilitySnapshot(() => capabilityRegistry.getState(id));
}

/**
 * @deprecated Use useCapabilityState instead to avoid confusion with React's useState
 */
export const useState = useCapabilityState;

/**
 * Hook to reactively get a state's value
 * Automatically subscribes to changes if the state supports it
 */
export function useStateValue<T = any>(id: string): T | undefined {
  const [value, setValue] = React.useState<T | undefined>(undefined);
  const stateCapability = useCapabilityState(id);

  React.useEffect(() => {
    if (!stateCapability) {
      setValue(undefined);
      return;
    }

    // Set initial value
    setValue(stateCapability.getValue());

    // Subscribe to changes if supported
    if (stateCapability.subscribe) {
      const unsubscribe = stateCapability.subscribe((newValue) => {
        setValue(newValue);
      });
      return unsubscribe;
    }
  }, [stateCapability]);

  return value;
}

/**
 * Hook to execute an action with loading and error state management
 */
export function useExecuteAction(actionId: string) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const action = useAction(actionId);

  const execute = React.useCallback(async (ctx?: ActionContext) => {
    if (!action) {
      const err = new Error(`Action not found: ${actionId}`);
      setError(err);
      throw err;
    }

    if (action.enabled && !action.enabled()) {
      const err = new Error(`Action is disabled: ${actionId}`);
      setError(err);
      throw err;
    }

    setLoading(true);
    setError(null);

    try {
      await action.execute(ctx);
      setLoading(false);
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setLoading(false);
      throw error;
    }
  }, [action, actionId]);

  const reset = React.useCallback(() => {
    setLoading(false);
    setError(null);
  }, []);

  return {
    execute,
    loading,
    error,
    reset,
    isEnabled: action?.enabled ? action.enabled() : true,
    action,
  };
}

/**
 * Search result type
 */
export interface CapabilitySearchResult {
  type: 'feature' | 'route' | 'action' | 'state';
  id: string;
  name: string;
  description?: string;
  icon?: string;
  data: FeatureCapability | RouteCapability | ActionCapability | StateCapability;
}

/**
 * Hook to search across all capabilities
 */
export function useSearchCapabilities(query?: string) {
  const features = useFeatures();
  const routes = useRoutes();
  const actions = useActions();
  const states = useStates();

  const results = React.useMemo(() => {
    if (!query || query.trim() === '') {
      return [];
    }

    const searchTerm = query.toLowerCase().trim();
    const results: CapabilitySearchResult[] = [];

    // Search features
    features.forEach(feature => {
      if (
        feature.name.toLowerCase().includes(searchTerm) ||
        feature.description.toLowerCase().includes(searchTerm) ||
        feature.id.toLowerCase().includes(searchTerm)
      ) {
        results.push({
          type: 'feature',
          id: feature.id,
          name: feature.name,
          description: feature.description,
          icon: feature.icon,
          data: feature,
        });
      }
    });

    // Search routes
    routes.forEach(route => {
      if (
        route.name.toLowerCase().includes(searchTerm) ||
        route.path.toLowerCase().includes(searchTerm) ||
        (route.description?.toLowerCase().includes(searchTerm))
      ) {
        results.push({
          type: 'route',
          id: route.path,
          name: route.name,
          description: route.description,
          icon: route.icon,
          data: route,
        });
      }
    });

    // Search actions
    actions.forEach(action => {
      if (
        action.name.toLowerCase().includes(searchTerm) ||
        action.id.toLowerCase().includes(searchTerm) ||
        (action.description?.toLowerCase().includes(searchTerm))
      ) {
        results.push({
          type: 'action',
          id: action.id,
          name: action.name,
          description: action.description,
          icon: action.icon,
          data: action,
        });
      }
    });

    // Search states
    states.forEach(state => {
      if (
        state.name.toLowerCase().includes(searchTerm) ||
        state.id.toLowerCase().includes(searchTerm)
      ) {
        results.push({
          type: 'state',
          id: state.id,
          name: state.name,
          description: undefined,
          icon: undefined,
          data: state,
        });
      }
    });

    return results;
  }, [query, features, routes, actions, states]);

  return results;
}

/**
 * Command for command palette
 */
export interface Command {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  category?: string;
  execute: () => void | Promise<void>;
  enabled: boolean;
}

/**
 * Hook for command palette integration
 * Converts actions into commands with fuzzy search support
 */
export function useCommandPalette(query?: string) {
  const actions = useActions();
  const features = useFeatures();

  // Convert actions to commands
  const commands = React.useMemo(() => {
    return actions
      .filter(action => action.visibility !== 'hidden' && action.visibility !== 'contextMenu')
      .map(action => {
      // Find the feature this action belongs to
      const feature = features.find(f => f.id === action.featureId);

      return {
        id: action.id,
        name: action.name,
        description: action.description,
        icon: action.icon,
        shortcut: action.shortcut,
        category: feature?.name || action.category,
        execute: () => action.execute({ source: 'commandPalette' }),
        enabled: action.enabled ? action.enabled() : true,
      } as Command;
    });
  }, [actions, features]);

  // Filter commands by query
  const filteredCommands = React.useMemo(() => {
    if (!query || query.trim() === '') {
      return commands;
    }

    const searchTerm = query.toLowerCase().trim();

    return commands.filter(cmd =>
      cmd.name.toLowerCase().includes(searchTerm) ||
      cmd.id.toLowerCase().includes(searchTerm) ||
      (cmd.description?.toLowerCase().includes(searchTerm)) ||
      (cmd.category?.toLowerCase().includes(searchTerm))
    );
  }, [commands, query]);

  // Execute command by ID
  const executeCommand = React.useCallback(async (commandId: string) => {
    const command = commands.find(c => c.id === commandId);
    if (!command) {
      throw new Error(`Command not found: ${commandId}`);
    }
    if (!command.enabled) {
      throw new Error(`Command is disabled: ${commandId}`);
    }
    await command.execute();
  }, [commands]);

  return {
    commands: filteredCommands,
    allCommands: commands,
    executeCommand,
  };
}

/**
 * Hook to check if user has permission for a capability
 * By default, checks feature permissions
 */
export function useCapabilityPermission(
  featureId: string,
  userPermissions?: string[]
): boolean {
  const feature = useFeature(featureId);

  return React.useMemo(() => {
    if (!feature) {
      return false;
    }

    // If no permissions required, allow access
    if (!feature.permissions || feature.permissions.length === 0) {
      return true;
    }

    // If no user permissions provided, deny access
    if (!userPermissions || userPermissions.length === 0) {
      return false;
    }

    // Check if user has all required permissions
    return feature.permissions.every(required =>
      userPermissions.includes(required)
    );
  }, [feature, userPermissions]);
}

/**
 * Hook to filter features by user permissions
 */
export function useAllowedFeatures(userPermissions?: string[]): FeatureCapability[] {
  const features = useFeatures();

  return React.useMemo(() => {
    if (!userPermissions || userPermissions.length === 0) {
      // Return features with no permission requirements
      return features.filter(f => !f.permissions || f.permissions.length === 0);
    }

    return features.filter(feature => {
      if (!feature.permissions || feature.permissions.length === 0) {
        return true;
      }
      return feature.permissions.every(required =>
        userPermissions.includes(required)
      );
    });
  }, [features, userPermissions]);
}

/**
 * Hook to filter actions by user permissions
 * Checks both action's feature permissions and action-level permissions if any
 */
export function useAllowedActions(userPermissions?: string[]): ActionCapability[] {
  const actions = useActions();
  const features = useFeatures();

  return React.useMemo(() => {
    return actions.filter(action => {
      // Check feature-level permissions
      if (action.featureId) {
        const feature = features.find(f => f.id === action.featureId);
        if (feature?.permissions && feature.permissions.length > 0) {
          if (!userPermissions || userPermissions.length === 0) {
            return false;
          }
          const hasFeaturePermission = feature.permissions.every(required =>
            userPermissions.includes(required)
          );
          if (!hasFeaturePermission) {
            return false;
          }
        }
      }

      return true;
    });
  }, [actions, features, userPermissions]);
}

/**
 * Hook for plugins to register capabilities declaratively
 * Automatically handles registration and cleanup on unmount
 */
export function useRegisterCapabilities(
  config: {
    features?: FeatureCapability[];
    routes?: RouteCapability[];
    actions?: ActionCapability[];
    states?: StateCapability[];
  },
  deps: React.DependencyList = []
) {
  React.useEffect(() => {
    // Register all capabilities
    config.features?.forEach(feature => {
      registerFeature(feature);
    });

    config.routes?.forEach(route => {
      registerRoute(route);
    });

    config.actions?.forEach(action => {
      registerAction(action);
    });

    config.states?.forEach(state => {
      registerState(state);
    });

    // Cleanup on unmount
    return () => {
      config.features?.forEach(feature => {
        unregisterFeature(feature.id);
      });

      config.routes?.forEach(route => {
        unregisterRoute(route.path);
      });

      config.actions?.forEach(action => {
        unregisterAction(action.id);
      });

      config.states?.forEach(state => {
        unregisterState(state.id);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Convenience function to register a complete feature with routes and actions
 */
export function registerCompleteFeature(config: {
  feature: FeatureCapability;
  routes?: RouteCapability[];
  actions?: ActionCapability[];
  states?: StateCapability[];
}) {
  // Register feature
  registerFeature(config.feature);

  // Register routes
  config.routes?.forEach(route => {
    registerRoute({ ...route, featureId: config.feature.id });
  });

  // Register actions
  config.actions?.forEach(action => {
    registerAction({ ...action, featureId: config.feature.id });
  });

  // Register states
  config.states?.forEach(state => {
    registerState(state);
  });
}
