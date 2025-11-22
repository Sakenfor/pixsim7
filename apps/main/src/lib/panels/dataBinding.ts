/**
 * Data Binding System - Public API
 *
 * Main entry point for the Panel Builder data binding system.
 * Part of Task 51 - Builder Data Sources & Binding System
 *
 * @example
 * ```typescript
 * import { dataSourceRegistry, useResolvedBinding, initializeCoreDataSources } from './panels/dataBinding';
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

// Core types
export type {
  DataSourceType,
  DataSourceDefinition,
  DataBinding,
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
} from './useDataBindings';

// Core data sources & transforms
export {
  registerCoreDataSources,
  registerCoreTransforms,
  initializeCoreDataSources,
} from './coreDataSources';
