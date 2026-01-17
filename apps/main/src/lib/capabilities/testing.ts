/**
 * Testing utilities for capability registry
 *
 * Provides mock stores, fixtures, and helper functions for testing
 * components that use the capability registry.
 */

import { createAppCapabilityRegistry, type AppCapabilityRegistry } from '@pixsim7/shared.capabilities.core/app';

import type {
  FeatureCapability,
  RouteCapability,
  ActionCapability,
  StateCapability,
} from './index';

/**
 * Create a mock capability registry for testing
 */
export function createMockCapabilityStore(initialData?: {
  features?: FeatureCapability[];
  routes?: RouteCapability[];
  actions?: ActionCapability[];
  states?: StateCapability[];
}): AppCapabilityRegistry {
  const registry = createAppCapabilityRegistry();

  initialData?.features?.forEach(feature => registry.registerFeature(feature));
  initialData?.routes?.forEach(route => registry.registerRoute(route));
  initialData?.actions?.forEach(action => registry.registerAction(action));
  initialData?.states?.forEach(state => registry.registerState(state));

  return registry;
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
    featureId: 'mock-feature',
    execute: jest.fn(),
    enabled: () => true,
    ...overrides,
  };
}

/**
 * Mock state fixture
 */
export function createMockState(overrides?: Partial<StateCapability>): StateCapability {
  const value: any = null;
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
 * Test helper to clear the capability registry
 */
export function clearCapabilityStore(store: AppCapabilityRegistry) {
  store.clearAll();
}

/**
 * Test helper to populate capability store
 */
export function populateCapabilityStore(
  store: AppCapabilityRegistry,
  data: {
    features?: FeatureCapability[];
    routes?: RouteCapability[];
    actions?: ActionCapability[];
    states?: StateCapability[];
  }
) {
  data.features?.forEach(f => store.registerFeature(f));
  data.routes?.forEach(r => store.registerRoute(r));
  data.actions?.forEach(a => store.registerAction(a));
  data.states?.forEach(s => store.registerState(s));
}
