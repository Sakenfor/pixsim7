/**
 * Generate a UUID v4 (random)
 * Browser-compatible implementation
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    // Modern browsers
    return crypto.randomUUID();
  }

  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a short UUID (first 8 characters)
 * Good for IDs where full UUID is too long
 */
export function generateShortUUID(): string {
  return generateUUID().substring(0, 8);
}

/**
 * Generate a prefixed ID with UUID
 * @param prefix - The prefix for the ID (e.g., 'cube', 'conn', 'formation')
 * @param short - Use short UUID (8 chars) instead of full UUID
 */
export function generatePrefixedUUID(prefix: string, short = true): string {
  const uuid = short ? generateShortUUID() : generateUUID();
  return `${prefix}-${uuid}`;
}
