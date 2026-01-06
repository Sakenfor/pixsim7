/**
 * Testing utilities for capability registry
 *
 * Provides mock stores, fixtures, and helper functions for testing
 * components that use the capability registry.
 */

import { ReactNode } from 'react';
import { create } from 'zustand';
import type {
  FeatureCapability,
  RouteCapability,
  ActionCapability,
  StateCapability,
} from './index';

/**
 * Create a mock capability store for testing
 */
export function createMockCapabilityStore(initialData?: {
  features?: FeatureCapability[];
  routes?: RouteCapability[];
  actions?: ActionCapability[];
  states?: StateCapability[];
}) {
  const features = new Map<string, FeatureCapability>();
  const routes = new Map<string, RouteCapability>();
  const actions = new Map<string, ActionCapability>();
  const states = new Map<string, StateCapability>();

  // Populate with initial data
  initialData?.features?.forEach(f => features.set(f.id, f));
  initialData?.routes?.forEach(r => routes.set(r.path, r));
  initialData?.actions?.forEach(a => actions.set(a.id, a));
  initialData?.states?.forEach(s => states.set(s.id, s));

  return create(() => ({
    features,
    routes,
    actions,
    states,
    listeners: new Set<() => void>(),

    // Feature methods
    registerFeature: (feature: FeatureCapability) => features.set(feature.id, feature),
    unregisterFeature: (id: string) => features.delete(id),
    getFeature: (id: string) => features.get(id),
    getAllFeatures: () => Array.from(features.values()),
    getFeaturesByCategory: (category: string) =>
      Array.from(features.values()).filter(f => f.category === category),

    // Route methods
    registerRoute: (route: RouteCapability) => routes.set(route.path, route),
    unregisterRoute: (path: string) => routes.delete(path),
    getRoute: (path: string) => routes.get(path),
    getAllRoutes: () => Array.from(routes.values()),
    getRoutesForFeature: (featureId: string) =>
      Array.from(routes.values()).filter(r => r.featureId === featureId),

    // Action methods
    registerAction: (action: ActionCapability) => actions.set(action.id, action),
    unregisterAction: (id: string) => actions.delete(id),
    getAction: (id: string) => actions.get(id),
    getAllActions: () => Array.from(actions.values()),
    executeAction: async (id: string, ctx?: import('@shared/types').ActionContext) => {
      const action = actions.get(id);
      if (!action) throw new Error(`Action not found: ${id}`);
      await action.execute(ctx);
    },

    // State methods
    registerState: (state: StateCapability) => states.set(state.id, state),
    unregisterState: (id: string) => states.delete(id),
    getState: (id: string) => states.get(id),
    getAllStates: () => Array.from(states.values()),

    // Subscription
    subscribe: (callback: () => void) => {
      return () => {};
    },
    notify: () => {},
  }));
}

/**
 * Mock feature fixture
 */
export function createMockFeature(overrides?: Partial<FeatureCapability>): FeatureCapability {
  return {
    id: 'mock-feature',
    name: 'Mock Feature',
    description: 'A mock feature for testing',
    category: 'utility',
    priority: 50,
    enabled: () => true,
    ...overrides,
  };
}

/**
 * Mock route fixture
 */
export function createMockRoute(overrides?: Partial<RouteCapability>): RouteCapability {
  return {
    path: '/mock-route',
    name: 'Mock Route',
    description: 'A mock route for testing',
    icon: '🔧',
    protected: false,
    showInNav: true,
    ...overrides,
  };
}

/**
 * Mock action fixture
 */
export function createMockAction(overrides?: Partial<ActionCapability>): ActionCapability {
  return {
    id: 'mock-action',
    name: 'Mock Action',
    description: 'A mock action for testing',
    icon: '⚡',
    execute: jest.fn(),
    enabled: () => true,
    ...overrides,
  };
}

/**
 * Mock state fixture
 */
export function createMockState(overrides?: Partial<StateCapability>): StateCapability {
  let value: any = null;
  const listeners = new Set<(value: any) => void>();

  return {
    id: 'mock-state',
    name: 'Mock State',
    getValue: () => value,
    subscribe: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    readonly: false,
    ...overrides,
  };
}

/**
 * Wait for async updates in tests
 */
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Create a complete feature setup for testing
 */
export function createCompleteFeatureSetup() {
  const feature = createMockFeature({
    id: 'test-feature',
    name: 'Test Feature',
    category: 'creation',
  });

  const route = createMockRoute({
    path: '/test',
    name: 'Test Route',
    featureId: 'test-feature',
  });

  const action = createMockAction({
    id: 'test-action',
    name: 'Test Action',
    featureId: 'test-feature',
  });

  const state = createMockState({
    id: 'test-state',
    name: 'Test State',
  });

  return {
    feature,
    route,
    action,
    state,
  };
}

/**
 * Test helper to clear the capability store
 */
export function clearCapabilityStore(store: any) {
  store.getState().features.clear();
  store.getState().routes.clear();
  store.getState().actions.clear();
  store.getState().states.clear();
}

/**
 * Test helper to populate capability store
 */
export function populateCapabilityStore(
  store: any,
  data: {
    features?: FeatureCapability[];
    routes?: RouteCapability[];
    actions?: ActionCapability[];
    states?: StateCapability[];
  }
) {
  data.features?.forEach(f => store.getState().registerFeature(f));
  data.routes?.forEach(r => store.getState().registerRoute(r));
  data.actions?.forEach(a => store.getState().registerAction(a));
  data.states?.forEach(s => store.getState().registerState(s));
}
