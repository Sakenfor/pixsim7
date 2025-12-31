/**
 * Data Binding Hooks
 *
 * React hooks for consuming resolved data in widgets and panels.
 * Part of Task 51 Phase 51.3 - Builder Integration Hooks
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import type { DataSourceBinding } from './dataSourceRegistry';
import { dataSourceRegistry } from './dataSourceRegistry';
import type { ResolvedBinding, DataContext } from './dataResolver';
import { resolveBinding, resolveBindings } from './dataResolver';
import { subscribeToStore, type StoreId } from './storeAccessors';

/**
 * Hook to resolve a single data source binding
 * Automatically updates when the underlying data changes
 */
export function useResolvedBinding<T = unknown>(
  binding: DataSourceBinding | undefined,
  context?: DataContext
): ResolvedBinding<T> | undefined {
  const [result, setResult] = useState<ResolvedBinding<T> | undefined>(() => {
    if (!binding) return undefined;
    return resolveBinding<T>(binding, context);
  });

  // Track which stores this binding depends on
  const dependentStores = useMemo(() => {
    if (!binding) return [];
    return getBindingDependentStores(binding);
  }, [binding]);

  // Re-resolve when binding changes
  useEffect(() => {
    if (!binding) {
      setResult(undefined);
      return;
    }

    setResult(resolveBinding<T>(binding, context));
  }, [binding, context]);

  // Subscribe to store changes
  useEffect(() => {
    if (dependentStores.length === 0) return;

    const unsubscribers = dependentStores.map((storeId) =>
      subscribeToStore(storeId, () => {
        if (binding) {
          setResult(resolveBinding<T>(binding, context));
        }
      })
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [binding, context, dependentStores]);

  return result;
}

/**
 * Hook to resolve multiple data source bindings
 * Automatically updates when any underlying data changes
 */
export function useResolvedBindings<T = unknown>(
  bindings: Record<string, DataSourceBinding> | undefined,
  context?: DataContext
): Record<string, ResolvedBinding<T>> {
  const [result, setResult] = useState<Record<string, ResolvedBinding<T>>>(() => {
    if (!bindings) return {};
    return resolveBindings<T>(bindings, context);
  });

  // Track which stores these bindings depend on
  const dependentStores = useMemo(() => {
    if (!bindings) return [];
    const stores = new Set<StoreId>();
    Object.values(bindings).forEach((binding) => {
      getBindingDependentStores(binding).forEach((store) => stores.add(store));
    });
    return Array.from(stores);
  }, [bindings]);

  // Re-resolve when bindings change
  useEffect(() => {
    if (!bindings) {
      setResult({});
      return;
    }

    setResult(resolveBindings<T>(bindings, context));
  }, [bindings, context]);

  // Subscribe to store changes
  useEffect(() => {
    if (dependentStores.length === 0) return;

    const unsubscribers = dependentStores.map((storeId) =>
      subscribeToStore(storeId, () => {
        if (bindings) {
          setResult(resolveBindings<T>(bindings, context));
        }
      })
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [bindings, context, dependentStores]);

  return result;
}

/**
 * Hook to get the resolved value from a data source binding (unwrapped)
 * Returns just the value, not the full ResolvedBinding object
 */
export function useBindingValue<T = unknown>(
  binding: DataSourceBinding | undefined,
  context?: DataContext
): T | undefined {
  const resolved = useResolvedBinding<T>(binding, context);
  return resolved?.value;
}

/**
 * Hook to get resolved values from multiple data source bindings (unwrapped)
 * Returns a map of prop names to values
 */
export function useBindingValues<T = unknown>(
  bindings: Record<string, DataSourceBinding> | undefined,
  context?: DataContext
): Record<string, T | undefined> {
  const resolved = useResolvedBindings<T>(bindings, context);

  return useMemo(() => {
    const values: Record<string, T | undefined> = {};
    for (const [key, binding] of Object.entries(resolved)) {
      values[key] = binding.value;
    }
    return values;
  }, [resolved]);
}

/**
 * Hook to access the data source registry
 * Provides reactive access to available sources and transforms
 */
export function useDataSourceRegistry() {
  const [, setTick] = useState(0);

  // Subscribe to registry changes
  useEffect(() => {
    const unsubscribe = dataSourceRegistry.subscribe(() => {
      setTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  return {
    sources: dataSourceRegistry.getAllSources(),
    transforms: dataSourceRegistry.getAllTransforms(),
    getSource: useCallback((id: string) => dataSourceRegistry.getSource(id), []),
    getTransform: useCallback((id: string) => dataSourceRegistry.getTransform(id), []),
    searchSources: useCallback((query: string) => dataSourceRegistry.searchSources(query), []),
    searchTransforms: useCallback((query: string) => dataSourceRegistry.searchTransforms(query), []),
  };
}

// ============================================================================
// Unified Widget Data Hook
// ============================================================================

/**
 * Hook to resolve data for widgets from DataSourceBindings.
 *
 * This provides a unified way to fetch data for ANY widget surface:
 * - Panel-composer blocks: pass returned data as `data` prop
 * - Overlay widgets: pass returned data to `render(data, context)`
 *
 * @example
 * ```tsx
 * // Define bindings
 * const bindings = [
 *   { id: 'b1', sourceId: 'asset:currentAsset', targetProp: 'asset' },
 *   { id: 'b2', sourceId: 'workspace:selectedCount', targetProp: 'count' },
 * ];
 *
 * // In component
 * const data = useWidgetData(bindings);
 * // data = { asset: {...}, count: 5 }
 *
 * // Pass to overlay
 * <OverlayContainer data={data} ... />
 *
 * // Or pass to block
 * <BlockComponent data={data} ... />
 * ```
 */
export function useWidgetData(
  bindings: DataSourceBinding[] | undefined,
  context?: DataContext
): Record<string, unknown> {
  // Convert array to record keyed by targetProp
  const bindingsRecord = useMemo(() => {
    if (!bindings || bindings.length === 0) return undefined;
    const record: Record<string, DataSourceBinding> = {};
    for (const binding of bindings) {
      record[binding.targetProp] = binding;
    }
    return record;
  }, [bindings]);

  // Use existing hook to resolve
  return useBindingValues(bindingsRecord, context);
}

/**
 * Create DataSourceBindings from a simple mapping.
 *
 * Convenience function to create bindings without specifying IDs.
 *
 * @example
 * ```tsx
 * const bindings = createWidgetBindings({
 *   label: 'workspace:currentAssetName',
 *   progress: 'upload:progress',
 * });
 * ```
 */
export function createWidgetBindings(
  mapping: Record<string, string>
): DataSourceBinding[] {
  return Object.entries(mapping).map(([targetProp, sourceId], index) => ({
    id: `binding-${index}`,
    sourceId,
    targetProp,
  }));
}

// ============================================================================
// Internals
// ============================================================================

/**
 * Helper to determine which stores a data source binding depends on
 */
function getBindingDependentStores(binding: DataSourceBinding): StoreId[] {
  const stores = new Set<StoreId>();

  // Get the source
  const source = dataSourceRegistry.getSource(binding.sourceId);
  if (!source) return [];

  // Add stores from the source
  addSourceDependentStores(source, stores);

  return Array.from(stores);
}

/**
 * Recursively find all store dependencies of a data source
 */
function addSourceDependentStores(source: any, stores: Set<StoreId>): void {
  if (source.type === 'store' && source.storeId) {
    const validStoreIds: StoreId[] = ['workspace', 'game-state'];
    if (validStoreIds.includes(source.storeId as StoreId)) {
      stores.add(source.storeId as StoreId);
    }
  }

  // For computed sources, recursively check dependencies
  if (source.type === 'computed' && source.dependencies) {
    for (const depId of source.dependencies) {
      const depSource = dataSourceRegistry.getSource(depId);
      if (depSource) {
        addSourceDependentStores(depSource, stores);
      }
    }
  }
}
