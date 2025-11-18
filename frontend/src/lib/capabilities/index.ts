/**
 * App Capability Registry
 *
 * Central system for exposing app features, routes, actions, and state
 * to UI plugins. Allows plugins to discover and integrate with app functionality
 * without hardcoding.
 *
 * Inspired by VS Code's extension API and Eclipse's contribution model.
 */

import { create } from 'zustand';

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

  /** Execute function */
  execute: (...args: any[]) => void | Promise<void>;

  /** Whether action is currently enabled */
  enabled?: () => boolean;

  /** Category */
  category?: string;

  /** Parent feature ID */
  featureId?: string;
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
  executeAction: (id: string, ...args: any[]) => Promise<void>;

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
    console.log(`[Capabilities] Registered feature: ${feature.name}`);
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
    console.log(`[Capabilities] Registered route: ${route.path}`);
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
    set((state) => {
      const actions = new Map(state.actions);
      actions.set(action.id, action);
      return { actions };
    });
    get().notify();
    console.log(`[Capabilities] Registered action: ${action.name}`);
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

  executeAction: async (id, ...args) => {
    const action = get().getAction(id);
    if (!action) {
      throw new Error(`Action not found: ${id}`);
    }
    if (action.enabled && !action.enabled()) {
      throw new Error(`Action is disabled: ${id}`);
    }
    await action.execute(...args);
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
 * Hook to get all actions
 */
export function useActions() {
  return useCapabilityStore((s) => s.getAllActions());
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
