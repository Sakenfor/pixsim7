/**
 * Object utilities
 *
 * Generic object manipulation utilities - pure TypeScript, no dependencies.
 */

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Deep merge two objects, with override taking precedence.
 *
 * - Recursively merges nested objects
 * - Arrays are not merged (override replaces base)
 * - null/undefined values in override skip merging (base value preserved)
 * - undefined values in override are skipped
 *
 * @param base - The base object
 * @param override - The override object (values take precedence)
 * @returns A new merged object
 *
 * @example
 * ```ts
 * const base = { a: 1, b: { c: 2, d: 3 } };
 * const override = { b: { c: 4 }, e: 5 };
 * const result = deepMerge(base, override);
 * // => { a: 1, b: { c: 4, d: 3 }, e: 5 }
 * ```
 */
export function deepMerge<T extends Record<string, any>>(
  base: T,
  override: DeepPartial<T>
): T {
  const result = { ...base };

  for (const key of Object.keys(override) as Array<keyof T>) {
    const overrideValue = override[key];
    const baseValue = base[key];

    // Skip undefined values in override
    if (overrideValue === undefined) {
      continue;
    }

    // Check if both values are mergeable objects (not null, not arrays)
    const isOverrideObject =
      overrideValue !== null &&
      typeof overrideValue === 'object' &&
      !Array.isArray(overrideValue);

    const isBaseObject =
      baseValue !== null &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue);

    if (isOverrideObject && isBaseObject) {
      // Recursively merge nested objects
      result[key] = deepMerge(
        baseValue as Record<string, any>,
        overrideValue as Record<string, any>
      ) as T[keyof T];
    } else {
      // Replace with override value
      result[key] = overrideValue as T[keyof T];
    }
  }

  return result;
}
