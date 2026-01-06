/**
 * App Capability Registry
 *
 * Central system for exposing app features, routes, actions, and state
 * to UI plugins. Allows plugins to discover and integrate with app functionality
 * without hardcoding.
 *
 * Inspired by VS Code's extension API and Eclipse's contribution model.
 */

import type { ActionContext, ActionDefinition } from '@shared/types';
import * as React from 'react';
import { create } from 'zustand';
import { debugFlags } from '@lib/utils/debugFlags';
import { logEvent } from '@lib/utils/logging';

// Re-export modules
export * from './routeConstants';
export * from './pluginAdapter';
export * from './securityFilter';

/**
 * Feature Capability
 * Represents a high-level feature of the app
 */
export interface FeatureCapability {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Description */
  description: string;

  /** Icon/emoji */
  icon?: string;

  /** Category */
  category: 'creation' | 'editing' | 'viewing' | 'management' | 'utility' | 'game';

  /** Priority for ordering */
  priority?: number;

  /** Routes associated with this feature */
  routes?: RouteCapability[];

  /** Actions available */
  actions?: ActionCapability[];

  /** State accessor */
  getState?: () => any;

  /** Whether this feature is currently enabled */
  enabled?: () => boolean;

  /** Required permissions */
  permissions?: string[];

  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Route Capability
 * Represents a route/page in the app
 */
export interface RouteCapability {
  /** Route path */
  path: string;

  /** Display name */
  name: string;

  /** Description */
  description?: string;

  /** Icon */
  icon?: string;

  /** Whether route requires auth */
  protected?: boolean;

  /** Whether to show in navigation */
  showInNav?: boolean;

  /** Parent feature ID */
  featureId?: string;

  /** Parameters */
  params?: Record<string, string>;
}

/**
 * Action Capability
 * Represents an executable action
 */
export interface ActionCapability {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Description */
  description?: string;

  /** Icon */
  icon?: string;

  /** Keyboard shortcut */
  shortcut?: string;

  /**
   * Execute function.
   * Accepts optional ActionContext for standardized invocation.
   */
  execute: (ctx?: ActionContext) => void | Promise<void>;

  /** Whether action is currently enabled */
  enabled?: () => boolean;

  /** Category */
  category?: string;

  /** Parent feature ID */
  featureId?: string;
}

/**
 * Convert an ActionDefinition to an ActionCapability.
 *
 * This adapter allows module-defined actions (using the canonical ActionDefinition)
 * to be registered with the capability store without ad-hoc conversions.
 *
 * @param action - Canonical ActionDefinition from module page.actions
 * @returns ActionCapability for registration with useCapabilityStore
 *
 * @example
 * ```typescript
 * import { toActionCapability } from '@lib/capabilities';
 *
 * const capability = toActionCapability(openGalleryAction);
 * useCapabilityStore.getState().registerAction(capability);
 * ```
 */
export function toActionCapability(action: ActionDefinition): ActionCapability {
  return {
    id: action.id,
    name: action.title,
    description: action.description,
    icon: action.icon,
    shortcut: action.shortcut,
    featureId: action.featureId,
    category: action.category,
    enabled: action.enabled,
    execute: action.execute,
  };
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
  const store = useCapabilityStore.getState();
  for (const action of actions) {
    store.registerAction(toActionCapability(action));
  }
}

/**
 * State Capability
 * Represents accessible state
 */
export interface StateCapability {
  /** State identifier */
  id: string;

  /** Display name */
  name: string;

  /** Get current value */
  getValue: () => any;

  /** Subscribe to changes */
  subscribe?: (callback: (value: any) => void) => () => void;

  /** Whether state is readonly */
  readonly?: boolean;
}

/**
 * Capability Registry Store
 */
interface CapabilityStore {
  features: Map<string, FeatureCapability>;
  routes: Map<string, RouteCapability>;
  actions: Map<string, ActionCapability>;
  states: Map<string, StateCapability>;
  listeners: Set<() => void>;

  // Feature methods
  registerFeature: (feature: FeatureCapability) => void;
  unregisterFeature: (id: string) => void;
  getFeature: (id: string) => FeatureCapability | undefined;
  getAllFeatures: () => FeatureCapability[];
  getFeaturesByCategory: (category: string) => FeatureCapability[];

  // Route methods
  registerRoute: (route: RouteCapability) => void;
  unregisterRoute: (path: string) => void;
  getRoute: (path: string) => RouteCapability | undefined;
  getAllRoutes: () => RouteCapability[];
  getRoutesForFeature: (featureId: string) => RouteCapability[];

  // Action methods
  registerAction: (action: ActionCapability) => void;
  unregisterAction: (id: string) => void;
  getAction: (id: string) => ActionCapability | undefined;
  getAllActions: () => ActionCapability[];
  executeAction: (id: string, ctx?: ActionContext) => Promise<void>;

  // State methods
  registerState: (state: StateCapability) => void;
  unregisterState: (id: string) => void;
  getState: (id: string) => StateCapability | undefined;
  getAllStates: () => StateCapability[];

  // Subscription
  subscribe: (callback: () => void) => () => void;
  notify: () => void;
}

/**
 * Capability Registry Store Implementation
 */
export const useCapabilityStore = create<CapabilityStore>((set, get) => ({
  features: new Map(),
  routes: new Map(),
  actions: new Map(),
  states: new Map(),
  listeners: new Set(),

  // Features
  registerFeature: (feature) => {
    set((state) => {
      const features = new Map(state.features);
      features.set(feature.id, feature);
      return { features };
    });
    get().notify();
    debugFlags.log('registry', `[Capabilities] Registered feature: ${feature.name}`);
    logEvent('DEBUG', 'capability_feature_registered', { featureId: feature.id, name: feature.name });
  },

  unregisterFeature: (id) => {
    set((state) => {
      const features = new Map(state.features);
      features.delete(id);
      return { features };
    });
    get().notify();
  },

  getFeature: (id) => {
    return get().features.get(id);
  },

  getAllFeatures: () => {
    return Array.from(get().features.values())
      .filter(f => !f.enabled || f.enabled())
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  },

  getFeaturesByCategory: (category) => {
    return get().getAllFeatures().filter(f => f.category === category);
  },

  // Routes
  registerRoute: (route) => {
    set((state) => {
      const routes = new Map(state.routes);
      routes.set(route.path, route);
      return { routes };
    });
    get().notify();
    debugFlags.log('registry', `[Capabilities] Registered route: ${route.path}`);
    logEvent('DEBUG', 'capability_route_registered', { path: route.path });
  },

  unregisterRoute: (path) => {
    set((state) => {
      const routes = new Map(state.routes);
      routes.delete(path);
      return { routes };
    });
    get().notify();
  },

  getRoute: (path) => {
    return get().routes.get(path);
  },

  getAllRoutes: () => {
    return Array.from(get().routes.values());
  },

  getRoutesForFeature: (featureId) => {
    return get().getAllRoutes().filter(r => r.featureId === featureId);
  },

  // Actions
  registerAction: (action) => {
    const existing = get().actions.get(action.id);
    if (existing && (existing.name !== action.name || existing.featureId !== action.featureId)) {
      logEvent('WARNING', 'capability_action_overwritten', {
        actionId: action.id,
        existingName: existing.name,
        newName: action.name,
        existingFeatureId: existing.featureId,
        newFeatureId: action.featureId,
      });
    }
    set((state) => {
      const actions = new Map(state.actions);
      actions.set(action.id, action);
      return { actions };
    });
    get().notify();
    debugFlags.log('registry', `[Capabilities] Registered action: ${action.name}`);
    logEvent('DEBUG', 'capability_action_registered', { actionId: action.id, name: action.name });
  },

  unregisterAction: (id) => {
    set((state) => {
      const actions = new Map(state.actions);
      actions.delete(id);
      return { actions };
    });
    get().notify();
  },

  getAction: (id) => {
    return get().actions.get(id);
  },

  getAllActions: () => {
    return Array.from(get().actions.values())
      .filter(a => !a.enabled || a.enabled());
  },

  executeAction: async (id, ctx) => {
    const action = get().getAction(id);
    if (!action) {
      throw new Error(`Action not found: ${id}`);
    }
    if (action.enabled && !action.enabled()) {
      throw new Error(`Action is disabled: ${id}`);
    }
    await action.execute(ctx);
  },

  // States
  registerState: (state) => {
    set((s) => {
      const states = new Map(s.states);
      states.set(state.id, state);
      return { states };
    });
    get().notify();
    console.log(`[Capabilities] Registered state: ${state.name}`);
  },

  unregisterState: (id) => {
    set((state) => {
      const states = new Map(state.states);
      states.delete(id);
      return { states };
    });
    get().notify();
  },

  getState: (id) => {
    return get().states.get(id);
  },

  getAllStates: () => {
    return Array.from(get().states.values());
  },

  // Subscription
  subscribe: (callback) => {
    get().listeners.add(callback);
    return () => {
      get().listeners.delete(callback);
    };
  },

  notify: () => {
    get().listeners.forEach(listener => listener());
  },
}));

/**
 * Hook to get all features
 */
export function useFeatures() {
  return useCapabilityStore((s) => s.getAllFeatures());
}

/**
 * Hook to get a specific feature by ID
 */
export function useFeature(id: string) {
  return useCapabilityStore((s) => s.getFeature(id));
}

/**
 * Hook to get features by category
 */
export function useFeaturesByCategory(category: string) {
  return useCapabilityStore((s) => s.getFeaturesByCategory(category));
}

/**
 * Hook to get all routes
 */
export function useRoutes() {
  return useCapabilityStore((s) => s.getAllRoutes());
}

/**
 * Hook to get routes for a specific feature
 */
export function useFeatureRoutes(featureId: string) {
  return useCapabilityStore((s) => s.getRoutesForFeature(featureId));
}

/**
 * Hook to get navigation routes (showInNav = true)
 */
export function useNavRoutes() {
  return useCapabilityStore((s) => s.getAllRoutes().filter(r => r.showInNav));
}

/**
 * Hook to get all actions
 */
export function useActions() {
  return useCapabilityStore((s) => s.getAllActions());
}

/**
 * Hook to get a specific action by ID
 */
export function useAction(id: string) {
  return useCapabilityStore((s) => s.getAction(id));
}

/**
 * Hook to get actions for a specific feature
 */
export function useFeatureActions(featureId: string) {
  return useCapabilityStore((s) =>
    s.getAllActions().filter(a => a.featureId === featureId)
  );
}

/**
 * Hook to get all states
 */
export function useStates() {
  return useCapabilityStore((s) => s.getAllStates());
}

/**
 * Hook to get a specific state capability by ID
 * Named useCapabilityState to avoid conflict with React's useState
 */
export function useCapabilityState(id: string) {
  return useCapabilityStore((s) => s.getState(id));
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
  const stateCapability = useCapabilityStore((s) => s.getState(id));

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
  const action = useCapabilityStore((s) => s.getAction(actionId));

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
    return actions.map(action => {
      // Find the feature this action belongs to
      const feature = features.find(f => f.id === action.featureId);

      return {
        id: action.id,
        name: action.name,
        description: action.description,
        icon: action.icon,
        shortcut: action.shortcut,
        category: feature?.name || action.category,
        execute: action.execute,
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
  const store = useCapabilityStore.getState();

  React.useEffect(() => {
    // Register all capabilities
    config.features?.forEach(feature => {
      store.registerFeature(feature);
    });

    config.routes?.forEach(route => {
      store.registerRoute(route);
    });

    config.actions?.forEach(action => {
      store.registerAction(action);
    });

    config.states?.forEach(state => {
      store.registerState(state);
    });

    // Cleanup on unmount
    return () => {
      config.features?.forEach(feature => {
        store.unregisterFeature(feature.id);
      });

      config.routes?.forEach(route => {
        store.unregisterRoute(route.path);
      });

      config.actions?.forEach(action => {
        store.unregisterAction(action.id);
      });

      config.states?.forEach(state => {
        store.unregisterState(state.id);
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
  const store = useCapabilityStore.getState();

  // Register feature
  store.registerFeature(config.feature);

  // Register routes
  config.routes?.forEach(route => {
    store.registerRoute({ ...route, featureId: config.feature.id });
  });

  // Register actions
  config.actions?.forEach(action => {
    store.registerAction({ ...action, featureId: config.feature.id });
  });

  // Register states
  config.states?.forEach(state => {
    store.registerState(state);
  });
}
