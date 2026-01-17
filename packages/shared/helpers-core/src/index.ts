/**
 * @pixsim7/shared.helpers-core
 *
 * Core helper registry pattern - pure TypeScript, no React/DOM dependencies.
 *
 * This package provides a generic, typed registry pattern for creating
 * domain-specific adapter registries. Similar to capabilities-core but
 * for static adapter lookup rather than dynamic provider selection.
 *
 * @example
 * ```ts
 * import { createHelperRegistry, type HelperAdapter } from '@pixsim7/shared.helpers-core';
 *
 * // Define your adapter interface
 * interface MyAdapter extends HelperAdapter<MyData> {
 *   source: string;
 * }
 *
 * // Create a typed registry
 * const myRegistry = createHelperRegistry<'source-a' | 'source-b', MyAdapter>();
 *
 * // Register adapters
 * myRegistry.register('source-a', {
 *   id: 'adapter-a',
 *   source: 'source-a',
 *   get: () => getData(),
 *   set: (data) => setData(data),
 * });
 *
 * // Use adapters
 * const adapter = myRegistry.get('source-a');
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  HelperAdapter,
  HelperRegistry,
  HelperRegistryOptions,
  Registry,
  RegistryOptions,
  RegistryChangeListener,
  RegistryChangeEvent,
} from './types';

// Factory
export { createRegistry, createHelperRegistry } from './registry';
