/**
 * Tests for Capability Registry Hooks
 */

import { renderHook, act } from '@testing-library/react';
import {
  useCapabilityStore,
  useFeatures,
  useFeatureRoutes,
  useActions,
  type FeatureCapability,
  type RouteCapability,
  type ActionCapability,
} from './index';

describe('Capability Hooks', () => {
  beforeEach(() => {
    // Clear store before each test
    const store = useCapabilityStore.getState();
    store.features.clear();
    store.routes.clear();
    store.actions.clear();
    store.states.clear();
  });

  describe('useFeatures', () => {
    it('returns empty array when no features registered', () => {
      const { result } = renderHook(() => useFeatures());
      expect(result.current).toEqual([]);
    });

    it('returns registered features', () => {
      const feature: FeatureCapability = {
        id: 'test-feature',
        name: 'Test Feature',
        description: 'A test feature',
        category: 'utility',
      };

      act(() => {
        useCapabilityStore.getState().registerFeature(feature);
      });

      const { result } = renderHook(() => useFeatures());
      expect(result.current).toHaveLength(1);
      expect(result.current[0]).toMatchObject(feature);
    });

    it('filters out disabled features', () => {
      const enabledFeature: FeatureCapability = {
        id: 'enabled',
        name: 'Enabled',
        description: 'Enabled feature',
        category: 'utility',
        enabled: () => true,
      };

      const disabledFeature: FeatureCapability = {
        id: 'disabled',
        name: 'Disabled',
        description: 'Disabled feature',
        category: 'utility',
        enabled: () => false,
      };

      act(() => {
        const store = useCapabilityStore.getState();
        store.registerFeature(enabledFeature);
        store.registerFeature(disabledFeature);
      });

      const { result } = renderHook(() => useFeatures());
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe('enabled');
    });

    it('sorts features by priority', () => {
      const lowPriority: FeatureCapability = {
        id: 'low',
        name: 'Low',
        description: 'Low priority',
        category: 'utility',
        priority: 1,
      };

      const highPriority: FeatureCapability = {
        id: 'high',
        name: 'High',
        description: 'High priority',
        category: 'utility',
        priority: 10,
      };

      act(() => {
        const store = useCapabilityStore.getState();
        store.registerFeature(lowPriority);
        store.registerFeature(highPriority);
      });

      const { result } = renderHook(() => useFeatures());
      expect(result.current[0].id).toBe('high');
      expect(result.current[1].id).toBe('low');
    });

    it('re-renders when features change', () => {
      const { result, rerender } = renderHook(() => useFeatures());
      expect(result.current).toHaveLength(0);

      act(() => {
        useCapabilityStore.getState().registerFeature({
          id: 'test',
          name: 'Test',
          description: 'Test',
          category: 'utility',
        });
      });

      rerender();
      expect(result.current).toHaveLength(1);
    });
  });

  describe('useFeatureRoutes', () => {
    it('returns empty array when no routes registered', () => {
      const { result } = renderHook(() => useFeatureRoutes('nonexistent'));
      expect(result.current).toEqual([]);
    });

    it('returns routes for specific feature', () => {
      const route1: RouteCapability = {
        path: '/test1',
        name: 'Test 1',
        featureId: 'feature-a',
      };

      const route2: RouteCapability = {
        path: '/test2',
        name: 'Test 2',
        featureId: 'feature-b',
      };

      act(() => {
        const store = useCapabilityStore.getState();
        store.registerRoute(route1);
        store.registerRoute(route2);
      });

      const { result } = renderHook(() => useFeatureRoutes('feature-a'));
      expect(result.current).toHaveLength(1);
      expect(result.current[0].path).toBe('/test1');
    });

    it('returns multiple routes for same feature', () => {
      const route1: RouteCapability = {
        path: '/feature/page1',
        name: 'Page 1',
        featureId: 'test-feature',
      };

      const route2: RouteCapability = {
        path: '/feature/page2',
        name: 'Page 2',
        featureId: 'test-feature',
      };

      act(() => {
        const store = useCapabilityStore.getState();
        store.registerRoute(route1);
        store.registerRoute(route2);
      });

      const { result } = renderHook(() => useFeatureRoutes('test-feature'));
      expect(result.current).toHaveLength(2);
    });

    it('re-renders when routes change', () => {
      const { result, rerender } = renderHook(() => useFeatureRoutes('test-feature'));
      expect(result.current).toHaveLength(0);

      act(() => {
        useCapabilityStore.getState().registerRoute({
          path: '/test',
          name: 'Test',
          featureId: 'test-feature',
        });
      });

      rerender();
      expect(result.current).toHaveLength(1);
    });
  });

  describe('useActions', () => {
    it('returns empty array when no actions registered', () => {
      const { result } = renderHook(() => useActions());
      expect(result.current).toEqual([]);
    });

    it('returns registered actions', () => {
      const action: ActionCapability = {
        id: 'test-action',
        name: 'Test Action',
        execute: jest.fn(),
      };

      act(() => {
        useCapabilityStore.getState().registerAction(action);
      });

      const { result } = renderHook(() => useActions());
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe('test-action');
    });

    it('filters out disabled actions', () => {
      const enabledAction: ActionCapability = {
        id: 'enabled',
        name: 'Enabled',
        execute: jest.fn(),
        enabled: () => true,
      };

      const disabledAction: ActionCapability = {
        id: 'disabled',
        name: 'Disabled',
        execute: jest.fn(),
        enabled: () => false,
      };

      act(() => {
        const store = useCapabilityStore.getState();
        store.registerAction(enabledAction);
        store.registerAction(disabledAction);
      });

      const { result } = renderHook(() => useActions());
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe('enabled');
    });

    it('re-renders when actions change', () => {
      const { result, rerender } = renderHook(() => useActions());
      expect(result.current).toHaveLength(0);

      act(() => {
        useCapabilityStore.getState().registerAction({
          id: 'test',
          name: 'Test',
          execute: jest.fn(),
        });
      });

      rerender();
      expect(result.current).toHaveLength(1);
    });
  });

  describe('Hook Reactivity', () => {
    it('useFeatures subscribes to store changes', () => {
      const { result } = renderHook(() => useFeatures());
      const initialLength = result.current.length;

      act(() => {
        useCapabilityStore.getState().registerFeature({
          id: 'new-feature',
          name: 'New Feature',
          description: 'New',
          category: 'utility',
        });
      });

      // Hook should automatically update
      expect(result.current.length).toBe(initialLength + 1);
    });

    it('useFeatureRoutes subscribes to store changes', () => {
      const { result } = renderHook(() => useFeatureRoutes('test'));
      const initialLength = result.current.length;

      act(() => {
        useCapabilityStore.getState().registerRoute({
          path: '/new',
          name: 'New Route',
          featureId: 'test',
        });
      });

      // Hook should automatically update
      expect(result.current.length).toBe(initialLength + 1);
    });

    it('useActions subscribes to store changes', () => {
      const { result } = renderHook(() => useActions());
      const initialLength = result.current.length;

      act(() => {
        useCapabilityStore.getState().registerAction({
          id: 'new-action',
          name: 'New Action',
          execute: jest.fn(),
        });
      });

      // Hook should automatically update
      expect(result.current.length).toBe(initialLength + 1);
    });
  });

  describe('Integration', () => {
    it('hooks work together for feature exploration', () => {
      // Register a complete feature
      const feature: FeatureCapability = {
        id: 'complete-feature',
        name: 'Complete Feature',
        description: 'A complete feature with routes and actions',
        category: 'utility',
      };

      const route: RouteCapability = {
        path: '/complete',
        name: 'Complete Route',
        featureId: 'complete-feature',
      };

      const action: ActionCapability = {
        id: 'complete-action',
        name: 'Complete Action',
        execute: jest.fn(),
        featureId: 'complete-feature',
      };

      act(() => {
        const store = useCapabilityStore.getState();
        store.registerFeature(feature);
        store.registerRoute(route);
        store.registerAction(action);
      });

      // All hooks should return the registered data
      const { result: featuresResult } = renderHook(() => useFeatures());
      const { result: routesResult } = renderHook(() => useFeatureRoutes('complete-feature'));
      const { result: actionsResult } = renderHook(() => useActions());

      expect(featuresResult.current.find(f => f.id === 'complete-feature')).toBeDefined();
      expect(routesResult.current).toHaveLength(1);
      expect(actionsResult.current.find(a => a.id === 'complete-action')).toBeDefined();
    });
  });
});
