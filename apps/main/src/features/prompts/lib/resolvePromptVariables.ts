/**
 * resolvePromptVariables — frontend mirror of the backend resolver
 * (services/prompt/resolver.py). Used for the "resolved preview"; the backend
 * is authoritative on the outbound generation path. Keep the two in sync.
 *
 * Rules: expand iff a value is set (no value → literal symbol); whole-token
 * match (ACTOR1 ≠ ACTOR1_DETAILS); recursive with depth cap + per-branch cycle
 * detection; backslash escape (\ACTOR1 → literal ACTOR1).
 */

import { applyTransform } from './variableTransforms';

export const DEFAULT_MAX_DEPTH = 10;

export interface VariableValueLike {
  name: string;
  value?: string;
  transform?: string;
}

/** Build a name → value map from entries, keeping only those with a value. */
export function buildVariableValueMap(
  entries: ReadonlyArray<VariableValueLike>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of entries) {
    const name = entry.name?.trim().toUpperCase();
    if (name && typeof entry.value === 'string' && entry.value) {
      map[name] = entry.value;
    }
  }
  return map;
}

/** Build a name → transform map for valued entries that carry a transform. */
export function buildVariableTransformMap(
  entries: ReadonlyArray<VariableValueLike>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of entries) {
    const name = entry.name?.trim().toUpperCase();
    if (name && entry.value && typeof entry.transform === 'string' && entry.transform) {
      map[name] = entry.transform;
    }
  }
  return map;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function resolvePromptVariables(
  text: string,
  values: Record<string, string>,
  transforms: Record<string, string> = {},
  maxDepth: number = DEFAULT_MAX_DEPTH,
): string {
  if (!text) return text;

  const valueMap = new Map<string, string>();
  for (const [rawName, value] of Object.entries(values)) {
    const name = rawName?.trim().toUpperCase();
    if (name && typeof value === 'string' && value) valueMap.set(name, value);
  }
  if (valueMap.size === 0) return text;

  const transformMap = new Map<string, string>();
  for (const [rawName, spec] of Object.entries(transforms)) {
    const name = rawName?.trim().toUpperCase();
    if (name && typeof spec === 'string' && spec) transformMap.set(name, spec);
  }

  // Longest first (defensive; token boundaries already prevent prefix matches).
  const names = [...valueMap.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(\\\\)?\\b(${names.map(escapeRegExp).join('|')})\\b`, 'g');

  const expand = (source: string, depth: number, active: ReadonlySet<string>): string =>
    source.replace(pattern, (_full, escaped: string | undefined, name: string) => {
      if (escaped) return name; // literal — drop the escape
      if (active.has(name) || depth >= maxDepth) return name; // cycle / too deep
      const next = new Set(active);
      next.add(name);
      const resolved = expand(valueMap.get(name) as string, depth + 1, next);
      return applyTransform(transformMap.get(name), resolved);
    });

  return expand(text, 0, new Set());
}
