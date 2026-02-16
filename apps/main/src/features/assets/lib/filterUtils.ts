import type { AssetFilters } from '../hooks/useAssets';

/** Check whether two filter objects are semantically equal (ignoring undefined/empty). */
export function filtersEqual(a: AssetFilters, b: AssetFilters): boolean {
  const normalize = (v: unknown) => {
    if (v === undefined || v === null || v === '' || v === false) return undefined;
    if (Array.isArray(v) && v.length === 0) return undefined;
    return v;
  };
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  const allKeys = new Set([...keysA, ...keysB]);
  for (const key of allKeys) {
    const va = normalize(a[key]);
    const vb = normalize(b[key]);
    if (va === vb) continue;
    if (JSON.stringify(va) !== JSON.stringify(vb)) return false;
  }
  return true;
}
