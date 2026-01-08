/**
 * App capability registry implementation - pure TypeScript, no React/DOM dependencies.
 */

import { createRegistry } from '@pixsim7/helpers-core';

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

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  featureRegistry.subscribe(() => notify());
  routeRegistry.subscribe(() => notify());
  actionRegistry.subscribe(() => notify());
  stateRegistry.subscribe(() => notify());

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
      return Array.from(featureRegistry.getAll().values())
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    },
    getFeaturesByCategory: (category) => {
      return Array.from(featureRegistry.getAll().values()).filter(
        (feature) => feature.category === category
      );
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
      return Array.from(routeRegistry.getAll().values());
    },
    getRoutesForFeature: (featureId) => {
      return Array.from(routeRegistry.getAll().values()).filter(
        (route) => route.featureId === featureId
      );
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
      return Array.from(actionRegistry.getAll().values());
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
      return Array.from(stateRegistry.getAll().values());
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
