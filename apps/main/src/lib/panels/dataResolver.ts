/**
 * Data Resolver
 *
 * Resolution engine for data bindings.
 * Turns DataBinding + DataSourceDefinition into actual data for widgets.
 * Part of Task 51 Phase 51.2 - Resolution Engine & Caching
 */

import type { DataBinding, DataSourceDefinition } from './dataSourceRegistry';
import { dataSourceRegistry } from './dataSourceRegistry';
import { getStoreValue, type StoreId } from './storeAccessors';

/**
 * Optional context for resolution
 */
export interface DataContext {
  // Optional pre-resolved slices of state if needed
  // e.g. current scene, current session, etc.
  [key: string]: unknown;
}

/**
 * Resolved binding result
 */
export interface ResolvedBinding<T = unknown> {
  binding: DataBinding;
  value: T | undefined;
  error?: Error;
}

/**
 * Resolve a single data binding to its actual value
 */
export function resolveBinding<T = unknown>(
  binding: DataBinding,
  context?: DataContext
): ResolvedBinding<T> {
  try {
    // Look up the data source definition
    const source = dataSourceRegistry.getSource(binding.sourceId);
    if (!source) {
      throw new Error(`Data source "${binding.sourceId}" not found`);
    }

    // Resolve the source to get the raw value
    let value = resolveSource(source, context);

    // Apply binding-level transform if specified
    if (binding.transformId) {
      const transform = dataSourceRegistry.getTransform(binding.transformId);
      if (!transform) {
        throw new Error(`Transform "${binding.transformId}" not found`);
      }
      value = transform.apply(value);
    }

    return {
      binding,
      value: value as T,
    };
  } catch (error) {
    // Use fallback value on error
    return {
      binding,
      value: binding.fallbackValue as T,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Resolve a data source definition to its value
 */
function resolveSource(source: DataSourceDefinition, context?: DataContext): unknown {
  switch (source.type) {
    case 'static':
      return resolveStaticSource(source);

    case 'store':
      return resolveStoreSource(source, context);

    case 'computed':
      return resolveComputedSource(source, context);

    default:
      throw new Error(`Unknown data source type: ${(source as any).type}`);
  }
}

/**
 * Resolve a static data source
 */
function resolveStaticSource(source: DataSourceDefinition): unknown {
  return source.value;
}

/**
 * Resolve a store-based data source
 */
function resolveStoreSource(source: DataSourceDefinition, _context?: DataContext): unknown {
  if (!source.storeId) {
    throw new Error(`Store source "${source.id}" is missing storeId`);
  }

  // Validate that storeId is whitelisted
  const storeId = source.storeId as StoreId;
  if (!isValidStoreId(storeId)) {
    throw new Error(`Store ID "${storeId}" is not whitelisted`);
  }

  // Get the value from the store
  return getStoreValue(storeId, source.path);
}

/**
 * Resolve a computed data source
 */
function resolveComputedSource(source: DataSourceDefinition, context?: DataContext): unknown {
  if (!source.dependencies || source.dependencies.length === 0) {
    throw new Error(`Computed source "${source.id}" has no dependencies`);
  }

  if (!source.transformId) {
    throw new Error(`Computed source "${source.id}" is missing transformId`);
  }

  // Detect circular dependencies (simple check - just one level deep)
  if (context?.['__resolving__']) {
    const resolvingSet = context['__resolving__'] as Set<string>;
    if (resolvingSet.has(source.id)) {
      throw new Error(`Circular dependency detected in computed source "${source.id}"`);
    }
  }

  // Track that we're resolving this source
  const resolvingSet = (context?.['__resolving__'] as Set<string>) || new Set<string>();
  resolvingSet.add(source.id);
  const extendedContext = { ...context, __resolving__: resolvingSet };

  try {
    // Resolve all dependencies
    const dependencyValues = source.dependencies.map((depId) => {
      const depSource = dataSourceRegistry.getSource(depId);
      if (!depSource) {
        throw new Error(`Dependency "${depId}" not found for computed source "${source.id}"`);
      }
      return resolveSource(depSource, extendedContext);
    });

    // Get the transform function
    const transform = dataSourceRegistry.getTransform(source.transformId);
    if (!transform) {
      throw new Error(`Transform "${source.transformId}" not found for computed source "${source.id}"`);
    }

    // Apply the transform to the dependency values
    // For computed sources, we pass an array of dependency values
    return transform.apply(dependencyValues);
  } finally {
    // Clean up the resolving set
    resolvingSet.delete(source.id);
  }
}

/**
 * Resolve multiple bindings at once
 */
export function resolveBindings<T = unknown>(
  bindings: Record<string, DataBinding>,
  context?: DataContext
): Record<string, ResolvedBinding<T>> {
  const result: Record<string, ResolvedBinding<T>> = {};

  for (const [key, binding] of Object.entries(bindings)) {
    result[key] = resolveBinding<T>(binding, context);
  }

  return result;
}

/**
 * Check if a store ID is valid (whitelisted)
 */
function isValidStoreId(storeId: string): storeId is StoreId {
  const validStoreIds: StoreId[] = ['workspace', 'game-state'];
  return validStoreIds.includes(storeId as StoreId);
}

/**
 * Helper to create a simple binding
 */
export function createBinding(
  id: string,
  sourceId: string,
  targetProp: string,
  options?: {
    transformId?: string;
    fallbackValue?: unknown;
  }
): DataBinding {
  return {
    id,
    sourceId,
    targetProp,
    transformId: options?.transformId,
    fallbackValue: options?.fallbackValue,
  };
}

/**
 * Batch resolve bindings with error isolation
 * Ensures one failed binding doesn't break others
 */
export function batchResolveBindings<T = unknown>(
  bindings: DataBinding[],
  context?: DataContext
): ResolvedBinding<T>[] {
  return bindings.map((binding) => resolveBinding<T>(binding, context));
}
