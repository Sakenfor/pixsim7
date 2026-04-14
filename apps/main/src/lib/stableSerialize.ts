/**
 * Deterministic JSON-like serialization with sorted object keys, suitable for
 * cache keys and fingerprints. Treats `null` and `undefined` as equivalent.
 */
export function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return 'null';

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
  }

  return JSON.stringify(String(value));
}
