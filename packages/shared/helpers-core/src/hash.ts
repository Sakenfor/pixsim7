/**
 * Hash utilities
 *
 * Cryptographic hashing utilities using Web Crypto API.
 */

/**
 * Compute SHA-256 hash of a file.
 *
 * @param file - File object to hash
 * @returns Promise resolving to hex-encoded SHA-256 hash
 *
 * @example
 * ```ts
 * const file = new File(['content'], 'example.txt');
 * const hash = await computeFileSha256(file);
 * // '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
 * ```
 */
export async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
