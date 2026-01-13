/**
 * App capability registry implementation - pure TypeScript, no React/DOM dependencies.
 */

import { createRegistry } from '@pixsim7/shared.helpers-core';

import type {
  AppActionCapability,
  AppActionContext,
  AppCapabilityRegistry,
  AppCapabilityRegistryOptions,
  AppFeatureCapability,
  AppRouteCapability,
  AppStateCapability,
} from "./types";

export function createAppCapabilityRegistry(
  options: AppCapabilityRegistryOptions = {}
): AppCapabilityRegistry {
  const featureRegistry = createRegistry<string, AppFeatureCapability>({
    warnOnOverwrite: false,
    onDuplicate: (feature) => {
      options.onDuplicateFeature?.(feature);
    },
    label: 'AppFeatureRegistry',
  });
  const routeRegistry = createRegistry<string, AppRouteCapability>({
    warnOnOverwrite: false,
    onDuplicate: (route) => {
      options.onDuplicateRoute?.(route);
    },
    label: 'AppRouteRegistry',
  });
  const actionRegistry = createRegistry<string, AppActionCapability>({
    warnOnOverwrite: false,
    onDuplicate: (action) => {
      options.onDuplicateAction?.(action);
    },
    label: 'AppActionRegistry',
  });
  const stateRegistry = createRegistry<string, AppStateCapability>({
    warnOnOverwrite: false,
    onDuplicate: (state) => {
      options.onDuplicateState?.(state);
    },
    label: 'AppStateRegistry',
  });
  const listeners = new Set<() => void>();

  let cachedFeatures: AppFeatureCapability[] = [];
  let cachedRoutes: AppRouteCapability[] = [];
  let cachedActions: AppActionCapability[] = [];
  let cachedStates: AppStateCapability[] = [];

  const updateFeatureCache = () => {
    cachedFeatures = Array.from(featureRegistry.getAll().values())
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  };

  const updateRouteCache = () => {
    cachedRoutes = Array.from(routeRegistry.getAll().values());
  };

  const updateActionCache = () => {
    cachedActions = Array.from(actionRegistry.getAll().values());
  };

  const updateStateCache = () => {
    cachedStates = Array.from(stateRegistry.getAll().values());
  };

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  featureRegistry.subscribe(() => {
    updateFeatureCache();
    notify();
  });
  routeRegistry.subscribe(() => {
    updateRouteCache();
    notify();
  });
  actionRegistry.subscribe(() => {
    updateActionCache();
    notify();
  });
  stateRegistry.subscribe(() => {
    updateStateCache();
    notify();
  });

  updateFeatureCache();
  updateRouteCache();
  updateActionCache();
  updateStateCache();

  return {
    registerFeature: (feature) => {
      featureRegistry.register(feature.id, feature);
    },
    unregisterFeature: (id) => {
      featureRegistry.unregister(id);
    },
    getFeature: (id) => {
      return featureRegistry.get(id);
    },
    getAllFeatures: () => {
      return cachedFeatures;
    },
    getFeaturesByCategory: (category) => {
      return cachedFeatures.filter((feature) => feature.category === category);
    },

    registerRoute: (route) => {
      routeRegistry.register(route.path, route);
    },
    unregisterRoute: (path) => {
      routeRegistry.unregister(path);
    },
    getRoute: (path) => {
      return routeRegistry.get(path);
    },
    getAllRoutes: () => {
      return cachedRoutes;
    },
    getRoutesForFeature: (featureId) => {
      return cachedRoutes.filter((route) => route.featureId === featureId);
    },

    registerAction: (action) => {
      actionRegistry.register(action.id, action);
    },
    unregisterAction: (id) => {
      actionRegistry.unregister(id);
    },
    getAction: (id) => {
      return actionRegistry.get(id);
    },
    getAllActions: () => {
      return cachedActions;
    },
    executeAction: async (id: string, ctx?: AppActionContext) => {
      const action = actionRegistry.get(id);
      if (!action) {
        throw new Error(`Action not found: ${id}`);
      }
      if (action.enabled && !action.enabled()) {
        throw new Error(`Action is disabled: ${id}`);
      }
      await action.execute(ctx);
    },

    registerState: (state) => {
      stateRegistry.register(state.id, state);
    },
    unregisterState: (id) => {
      stateRegistry.unregister(id);
    },
    getState: (id) => {
      return stateRegistry.get(id);
    },
    getAllStates: () => {
      return cachedStates;
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clearAll: () => {
      featureRegistry.clear();
      routeRegistry.clear();
      actionRegistry.clear();
      stateRegistry.clear();
    },
  };
}
