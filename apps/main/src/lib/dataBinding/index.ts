/**
 * Data Binding System - Public API
 *
 * Main entry point for the data binding system.
 * Part of Task 51 - Builder Data Sources & Binding System
 * Aligned with Editing Core architecture (Task 99)
 *
 * @example
 * ```typescript
 * import { dataSourceRegistry, useResolvedBinding, initializeCoreDataSources } from './dataBinding';
 *
 * // Initialize core data sources (do this once at app startup)
 * initializeCoreDataSources();
 *
 * // In a widget component
 * function MyWidget({ dataBindings }) {
 *   const values = useBindingValues(dataBindings);
 *   return <div>{values.myProp}</div>;
 * }
 * ```
 */

// Canonical data binding type from editing-core
export type { DataBinding, DataBindingKind } from '../editing-core/dataBinding';

// Registry-based Task 51 types
export type {
  DataSourceType,
  DataSourceDefinition,
  DataSourceBinding,
  DataTransform,
} from './dataSourceRegistry';

export type { DataContext, ResolvedBinding } from './dataResolver';

export type { StoreId, StoreAccessor } from './storeAccessors';

// Registry
export {
  DataSourceRegistry,
  dataSourceRegistry,
  createStoreSource,
  createStaticSource,
  createComputedSource,
} from './dataSourceRegistry';

// Resolution
export {
  resolveBinding,
  resolveBindings,
  createBinding,
  batchResolveBindings,
} from './dataResolver';

// Store access
export {
  storeAccessorRegistry,
  getValueByPath,
  getStoreValue,
  subscribeToStore,
} from './storeAccessors';

// React hooks
export {
  useResolvedBinding,
  useResolvedBindings,
  useBindingValue,
  useBindingValues,
  useDataSourceRegistry,
  // Unified widget data
  useWidgetData,
  createWidgetBindings,
} from './useDataBindings';

// Core data sources & transforms
export {
  registerCoreDataSources,
  registerCoreTransforms,
  initializeCoreDataSources,
} from './coreDataSources';
