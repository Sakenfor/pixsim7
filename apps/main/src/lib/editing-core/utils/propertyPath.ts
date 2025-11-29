/**
 * Property Path Resolution
 *
 * Core utility for resolving string-based property paths in data binding.
 * Part of editing-core to avoid circular dependencies.
 *
 * Examples:
 *   "uploadProgress" → data.uploadProgress
 *   "user.name" → data.user?.name
 *   "items[0].title" → data.items?.[0]?.title
 */

/**
 * Resolve a property path to a value
 * Supports dot notation and array indexing
 *
 * @param obj - The object to resolve the path on
 * @param path - The property path (e.g., "user.name" or "items[0].title")
 * @returns The resolved value, or undefined if not found
 */
export function resolvePath<T = any>(obj: any, path: string): T | undefined {
  if (!obj || !path) return undefined;

  // Handle simple paths first (most common case)
  if (!path.includes('.') && !path.includes('[')) {
    return obj[path];
  }

  // Parse complex paths: "user.profile.name" or "items[0].title"
  const parts = path
    .replace(/\[(\d+)\]/g, '.$1') // Convert array notation to dot notation
    .split('.')
    .filter(Boolean);

  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }

  return current;
}
