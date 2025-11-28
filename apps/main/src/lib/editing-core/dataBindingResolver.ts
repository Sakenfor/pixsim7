/**
 * Data Binding Resolver
 *
 * Resolves editing-core DataBinding to actual values at runtime.
 * This bridges the gap between serializable bindings and actual data resolution.
 * Part of Task 99 - Editing Core Data Binding Migration
 */

import type { DataBinding } from './dataBinding';
import { resolvePath } from './utils/propertyPath';

/**
 * Resolve a DataBinding to its value given runtime data
 *
 * @param binding - The data binding to resolve
 * @param data - Runtime data context
 * @returns The resolved value, or undefined if binding is not provided
 */
export function resolveDataBinding<T = unknown>(
  binding: DataBinding<T> | undefined,
  data: any
): T | undefined {
  if (!binding) return undefined;

  switch (binding.kind) {
    case 'static':
      return binding.staticValue;

    case 'path':
      if (!binding.path) return undefined;
      return resolvePath<T>(data, binding.path);

    case 'fn':
      if (!binding.fn) return undefined;
      return binding.fn(data);

    default:
      console.warn(`Unknown binding kind: ${(binding as any).kind}`);
      return undefined;
  }
}

/**
 * Resolve multiple data bindings to a record of values
 *
 * @param bindings - Array of data bindings
 * @param data - Runtime data context
 * @returns Record mapping each binding's target to its resolved value
 */
export function resolveDataBindings<T = unknown>(
  bindings: DataBinding<T>[] | undefined,
  data: any
): Record<string, T | undefined> {
  if (!bindings) return {};

  const result: Record<string, T | undefined> = {};

  for (const binding of bindings) {
    const value = resolveDataBinding(binding, data);
    result[binding.target] = value;
  }

  return result;
}

/**
 * Create a resolver function from a DataBinding
 *
 * This is useful when you need a function that resolves the binding,
 * for use in React hooks or other contexts where you need a stable function reference.
 *
 * @param binding - The data binding
 * @returns A function that resolves the binding given data
 */
export function createDataBindingResolver<T = unknown>(
  binding: DataBinding<T> | undefined
): (data: any) => T | undefined {
  if (!binding) {
    return () => undefined;
  }

  // Optimize for the common cases
  switch (binding.kind) {
    case 'static':
      // Return a constant function for static values
      const staticValue = binding.staticValue;
      return () => staticValue;

    case 'path':
      if (!binding.path) {
        return () => undefined;
      }
      const path = binding.path;
      return (data: any) => resolvePath<T>(data, path);

    case 'fn':
      if (!binding.fn) {
        return () => undefined;
      }
      return binding.fn;

    default:
      return () => undefined;
  }
}

/**
 * Helper to create a DataBinding from the old ad-hoc pattern
 *
 * This allows gradual migration from the old pattern:
 *   value: number | string | ((data: any) => number)
 * to the new DataBinding pattern:
 *   valueBinding: DataBinding<number>
 *
 * @param target - The target property name (e.g. 'value', 'label')
 * @param value - The value in the old format
 * @returns A proper DataBinding
 */
export function createBindingFromValue<T>(
  target: string,
  value: T | string | ((data: any) => T)
): DataBinding<T> {
  // Function - use 'fn' kind
  if (typeof value === 'function') {
    return {
      kind: 'fn',
      target,
      fn: value as (data: any) => T,
    };
  }

  // String - use 'path' kind
  if (typeof value === 'string') {
    return {
      kind: 'path',
      target,
      path: value,
    };
  }

  // Otherwise - use 'static' kind
  return {
    kind: 'static',
    target,
    staticValue: value,
  };
}
