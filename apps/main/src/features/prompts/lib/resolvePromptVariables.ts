/**
 * resolvePromptVariables — frontend mirror of the backend resolver
 * (services/prompt/resolver.py). Used for the "resolved preview"; the backend
 * is authoritative on the outbound generation path. Keep the two in sync.
 *
 * Rules: expand iff a value is set (no value → literal symbol); whole-token
 * match (ACTOR1 ≠ ACTOR1_DETAILS); recursive with depth cap + per-branch cycle
 * detection + an output-size budget; backslash escape (\ACTOR1 → literal ACTOR1).
 *
 * Token boundaries are Unicode-aware (`\p{L}\p{N}_` lookarounds, not ASCII `\b`)
 * so they match Python's Unicode `\b` — a token glued to an accented letter
 * (`caféACTOR1`) is part of a larger word and does NOT expand, on both engines.
 */

import { applyTransform } from './variableTransforms';

export const DEFAULT_MAX_DEPTH = 10;
/** Output-size safety valve mirroring the backend (see resolver.py). */
export const DEFAULT_MAX_OUTPUT_CHARS = 100_000;

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
  maxOutputChars: number = DEFAULT_MAX_OUTPUT_CHARS,
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
  // Unicode-aware boundaries (`\p{L}\p{N}_` lookarounds + `u` flag) mirror
  // Python's Unicode `\b`; ASCII `\b` would wrongly match a token abutting a
  // non-ASCII letter and diverge from the authoritative backend.
  const names = [...valueMap.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(\\\\)?(?<![\\p{L}\\p{N}_])(${names.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_])`,
    'gu',
  );

  // Output-size budget shared across the recursive tree — mirrors resolver.py so
  // a crafted fan-out can't freeze the tab building the preview.
  let produced = 0;
  const expand = (source: string, depth: number, active: ReadonlySet<string>): string =>
    source.replace(pattern, (_full, escaped: string | undefined, name: string) => {
      if (escaped) return name; // literal — drop the escape
      if (active.has(name) || depth >= maxDepth) return name; // cycle / too deep
      if (produced >= maxOutputChars) return name; // output budget exhausted
      const next = new Set(active);
      next.add(name);
      const resolved = applyTransform(
        transformMap.get(name),
        expand(valueMap.get(name) as string, depth + 1, next),
      );
      produced += resolved.length;
      return resolved;
    });

  return expand(text, 0, new Set());
}
