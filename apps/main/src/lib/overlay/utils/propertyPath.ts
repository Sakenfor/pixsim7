/**
 * Property Path Resolution
 *
 * Allows widgets to use string-based property paths for data binding
 * instead of requiring manual function writing.
 *
 * Examples:
 *   "uploadProgress" → (data) => data.uploadProgress
 *   "user.name" → (data) => data.user?.name
 *   "items[0].title" → (data) => data.items?.[0]?.title
 */

/**
 * Resolve a property path to a value
 * Supports dot notation and array indexing
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

/**
 * Create a resolver function from a value or property path
 * Automatically handles both functions and strings
 */
export function createResolver<T = any>(
  value: T | string | ((data: any) => T)
): (data: any) => T {
  // Already a function - return as is
  if (typeof value === 'function') {
    return value as (data: any) => T;
  }

  // String path - create resolver
  if (typeof value === 'string') {
    return (data: any) => resolvePath<T>(data, value);
  }

  // Static value - return constant function
  return () => value;
}

/**
 * Test if a value is a property path string
 */
export function isPropertyPath(value: any): boolean {
  return (
    typeof value === 'string' &&
    // Not a URL or regular text
    !value.startsWith('http') &&
    !value.startsWith('/') &&
    // Looks like a property path
    /^[a-zA-Z_$][a-zA-Z0-9_$.[\]]*$/.test(value)
  );
}

/**
 * Extract available property paths from a data object
 * Used to populate UI dropdowns
 */
export function extractPropertyPaths(
  obj: any,
  prefix = '',
  maxDepth = 3,
  currentDepth = 0
): string[] {
  if (!obj || typeof obj !== 'object' || currentDepth >= maxDepth) {
    return [];
  }

  const paths: string[] = [];

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;

    const path = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    // Add this path
    paths.push(path);

    // Recurse for nested objects (but not arrays or null)
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      currentDepth < maxDepth - 1
    ) {
      paths.push(...extractPropertyPaths(value, path, maxDepth, currentDepth + 1));
    }
  }

  return paths.sort();
}

/**
 * Get type hint for a property path
 * Helps UI show what type of data to expect
 */
export function getPathType(obj: any, path: string): string {
  const value = resolvePath(obj, path);

  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';

  return typeof value;
}

/**
 * Suggest property paths for a given widget type
 * Helps users find relevant data fields
 */
export function suggestPathsForWidget(
  widgetType: string,
  availablePaths: string[]
): string[] {
  const suggestions: Record<string, string[]> = {
    progress: ['progress', 'uploadProgress', 'downloadProgress', 'percentage', 'value'],
    upload: ['uploadState', 'uploadProgress', 'state', 'status'],
    video: ['videoUrl', 'remoteUrl', 'url', 'src', 'duration', 'durationSec'],
    badge: ['label', 'status', 'count', 'value'],
    menu: ['actions', 'items', 'options'],
    tooltip: ['description', 'tags', 'info', 'metadata'],
  };

  const keywords = suggestions[widgetType] || [];

  return availablePaths.filter(path => {
    const lowerPath = path.toLowerCase();
    return keywords.some(keyword => lowerPath.includes(keyword));
  });
}
