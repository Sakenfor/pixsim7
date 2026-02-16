/**
 * Shared helper for extracting data bindings from unified widget config.
 * Used by overlay widget definitions (both direct registrations and plugin-based).
 */

import type { UnifiedWidgetConfig } from '@lib/editing-core';
import { createBindingFromValue, type DataBinding } from '@lib/editing-core';

const isDev = import.meta.env?.DEV;

export function extractBinding<T>(
  bindings: UnifiedWidgetConfig['bindings'],
  target: string
): DataBinding<T> | undefined {
  if (!bindings) return undefined;
  const binding = bindings.find(b => b.target === target);
  if (!binding) return undefined;

  if (binding.kind === 'static') {
    return createBindingFromValue(target, binding.staticValue) as DataBinding<T>;
  } else if (binding.kind === 'path' && binding.path) {
    return { kind: 'path', path: binding.path, target } as DataBinding<T>;
  } else if (binding.kind === 'fn') {
    // Function bindings cannot be serialized/reconstructed from config.
    // They must be provided at runtime via widget factory options.
    if (isDev) {
      console.warn(
        `[extractBinding] Function binding for "${target}" cannot be reconstructed from serialized config. ` +
        `Provide it via runtimeOptions instead.`
      );
    }
    return undefined;
  }
  return undefined;
}
