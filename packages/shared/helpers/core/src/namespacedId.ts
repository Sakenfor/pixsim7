/**
 * Canonical namespaced identifier utilities.
 *
 * Convention: `namespace:name` where namespace is the part before the
 * **first** colon and name is everything after it. This means names
 * can contain colons (e.g., `set:thief:01` → namespace="set", name="thief:01").
 *
 * This module is the single source of truth for parsing/building
 * colon-delimited identifiers across the frontend codebase.
 */

export interface NamespacedId {
  namespace: string;
  name: string;
}

/**
 * Parse a `namespace:name` string by splitting on the first colon.
 *
 * Returns `null` if the string has no colon or either part is empty.
 *
 * @example
 * parseNamespacedId("character:alice")   // { namespace: "character", name: "alice" }
 * parseNamespacedId("set:thief:01")      // { namespace: "set", name: "thief:01" }
 * parseNamespacedId("scene:game:123")    // { namespace: "scene", name: "game:123" }
 * parseNamespacedId("bare-name")         // null
 * parseNamespacedId(":oops")             // null
 */
export function parseNamespacedId(id: string): NamespacedId | null {
  const colonIndex = id.indexOf(':');
  if (colonIndex <= 0) return null; // no colon, or colon at position 0 (empty namespace)

  const namespace = id.slice(0, colonIndex);
  const name = id.slice(colonIndex + 1);
  if (!name) return null; // empty name

  return { namespace, name };
}

/**
 * Build a `namespace:name` string from parts.
 *
 * @example
 * makeNamespacedId("character", "alice")     // "character:alice"
 * makeNamespacedId("set", "thief:01")        // "set:thief:01"
 */
export function makeNamespacedId(namespace: string, name: string): string {
  return `${namespace}:${name}`;
}

/**
 * Extract just the namespace from a `namespace:name` string.
 *
 * Returns `null` if the string has no colon or the namespace part is empty.
 *
 * @example
 * getNamespace("character:alice")  // "character"
 * getNamespace("set:thief:01")     // "set"
 * getNamespace("bare-name")        // null
 */
export function getNamespace(id: string): string | null {
  const colonIndex = id.indexOf(':');
  if (colonIndex <= 0) return null;
  return id.slice(0, colonIndex);
}

/**
 * Extract just the name from a `namespace:name` string.
 *
 * Returns `null` if the string has no colon or the name part is empty.
 *
 * @example
 * getName("character:alice")  // "alice"
 * getName("set:thief:01")     // "thief:01"
 * getName("bare-name")        // null
 */
export function getName(id: string): string | null {
  const colonIndex = id.indexOf(':');
  if (colonIndex <= 0) return null;
  const name = id.slice(colonIndex + 1);
  return name || null;
}
