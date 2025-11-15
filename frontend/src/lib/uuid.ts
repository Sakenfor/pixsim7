/**
 * UUID Generation Utilities
 *
 * Browser-compatible UUID generation without external dependencies.
 * Uses crypto.randomUUID() when available, falls back to Math.random().
 */

/**
 * Generate a UUID v4
 *
 * Uses crypto.randomUUID() if available (modern browsers),
 * otherwise falls back to a Math.random()-based implementation.
 */
export function generateUUID(): string {
  // Use native crypto.randomUUID() if available (Node 19+, modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback: Manual UUID v4 generation
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a short UUID (first 8 characters)
 *
 * Useful for human-readable IDs while maintaining uniqueness.
 * Note: Collision probability increases with shorter IDs.
 */
export function generateShortUUID(): string {
  return generateUUID().split('-')[0];
}

/**
 * Generate a prefixed UUID
 *
 * @param prefix - Prefix to add before the UUID (e.g., 'cube', 'conn')
 * @param short - If true, uses short UUID (8 chars), otherwise full UUID
 *
 * @example
 * generatePrefixedUUID('cube') // 'cube-a1b2c3d4'
 * generatePrefixedUUID('cube', false) // 'cube-a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7'
 */
export function generatePrefixedUUID(prefix: string, short = true): string {
  const uuid = short ? generateShortUUID() : generateUUID();
  return `${prefix}-${uuid}`;
}

/**
 * Validate if a string is a valid UUID v4
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Extract prefix from a prefixed UUID
 *
 * @example
 * extractPrefix('cube-a1b2c3d4') // 'cube'
 */
export function extractPrefix(prefixedId: string): string | null {
  const parts = prefixedId.split('-');
  if (parts.length < 2) return null;
  return parts[0];
}
