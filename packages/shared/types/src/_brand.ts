/**
 * Shared brand helper for nominal typing across the package.
 *
 * Uses a phantom string property (`__pixsim7Brand`) rather than a
 * `unique symbol`. The unique-symbol pattern silently fails to enforce
 * across module boundaries — when `Brand` is imported from another file,
 * TypeScript treats the symbol-keyed property as inaccessible and the
 * intersection collapses back to the base type, so `42` happily
 * assigns to `AssetId`. The phantom-string approach is structurally
 * enforced by the type system in any consumer module.
 *
 * The property is read-only and prefixed with the package name to make
 * accidental construction implausible. Intentional `as` casts are still
 * possible — that's the escape hatch by design.
 */

export type Brand<T, B extends string> = T & { readonly __pixsim7Brand: B };
