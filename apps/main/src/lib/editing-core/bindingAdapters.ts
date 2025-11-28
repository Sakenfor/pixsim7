/**
 * Binding Adapters
 *
 * Adapters to convert between serializable UnifiedDataBinding and runtime DataBinding.
 * Part of Task 99 - Editing Core Data Binding Migration
 */

import type { UnifiedDataBinding } from './unifiedConfig';
import type { DataBinding } from './dataBinding';

/**
 * Convert a UnifiedDataBinding (serializable) to a runtime DataBinding
 *
 * Note: The 'fn' kind cannot be represented in UnifiedDataBinding since functions
 * are not serializable. Such bindings must be created programmatically at runtime.
 */
export function fromUnifiedBinding<T = unknown>(b: UnifiedDataBinding): DataBinding<T> {
  return {
    kind: b.kind,
    target: b.target,
    path: b.path,
    staticValue: b.staticValue as T,
    // fn is undefined for serializable bindings
  };
}

/**
 * Convert a runtime DataBinding to a UnifiedDataBinding (serializable)
 *
 * Warning: Bindings with kind === 'fn' cannot be serialized. This function
 * will throw an error if you attempt to serialize such a binding.
 */
export function toUnifiedBinding(b: DataBinding): UnifiedDataBinding {
  if (b.kind === 'fn') {
    throw new Error(
      `Cannot serialize DataBinding with kind='fn'. ` +
        `Function bindings (kind='fn') are not serializable and must be created at runtime. ` +
        `Target: ${b.target}`
    );
  }

  return {
    kind: b.kind,
    target: b.target,
    path: b.path,
    staticValue: b.staticValue,
  };
}

/**
 * Convert an array of UnifiedDataBindings to runtime DataBindings
 */
export function fromUnifiedBindings<T = unknown>(
  bindings: UnifiedDataBinding[] | undefined
): DataBinding<T>[] {
  if (!bindings) return [];
  return bindings.map((b) => fromUnifiedBinding<T>(b));
}

/**
 * Convert an array of runtime DataBindings to UnifiedDataBindings
 *
 * Warning: Will throw if any binding has kind='fn'
 */
export function toUnifiedBindings(bindings: DataBinding[] | undefined): UnifiedDataBinding[] {
  if (!bindings) return [];
  return bindings.map(toUnifiedBinding);
}

/**
 * Check if a runtime DataBinding can be serialized
 */
export function isSerializable(binding: DataBinding): boolean {
  return binding.kind !== 'fn';
}

/**
 * Filter bindings to only those that are serializable
 *
 * This is useful when you have a mix of bindings and want to persist only the
 * serializable ones (kind='static' or kind='path').
 */
export function filterSerializableBindings(bindings: DataBinding[]): DataBinding[] {
  return bindings.filter(isSerializable);
}
