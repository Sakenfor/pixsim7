/**
 * Detect CUE definition references (e.g. `#VerticalAngleValues`) in
 * source text.
 *
 * The Builder operates on compiled JSON where refs have already
 * been resolved to their concrete values. Regenerating CUE from
 * that JSON would inline the values — losing the symbolic ref.
 * We surface this as a `BuilderCaveat` so users know that switching
 * to Builder is one-way for ref-using packs.
 */

const SCHEMA_DEFINED_REFS = new Set([
  '#PromptBlockPackV1',
  '#PromptPackManifestV1',
  '#PackBlock',
  '#BlockSchema',
  '#Variant',
  '#OpTemplate',
  '#OpParam',
  '#RefSpec',
  '#DescriptorOverlay',
  '#MatrixPreset',
  '#MatrixPresetQuery',
  '#TagRegistryV1',
  '#TagRegistryEntry',
  '#TagApplicability',
]);

export interface CueRefDetection {
  /** Distinct refs found, sorted by name. */
  refs: string[];
  /** 1-based line numbers where each ref appears. */
  lines: number[];
}

/**
 * Scan source for `#Xxx` references that would be lost on regen.
 *
 * Definition references used purely as schema constraints
 * (`& #PromptBlockPackV1`, `& #PromptPackManifestV1`) are noise —
 * the generator re-emits those itself — so they're filtered out.
 * Any other ref is treated as a "value reference" that we can't
 * round-trip (typical case: `enum: #VerticalAngleValues`).
 */
export function detectCueRefs(source: string): CueRefDetection {
  const found = new Map<string, number[]>();
  const lines = source.split('\n');
  // Match `#` followed by an uppercase identifier head.
  const pattern = /#[A-Z][A-Za-z0-9_]*/g;
  lines.forEach((line, idx) => {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(line)) !== null) {
      const name = m[0];
      if (SCHEMA_DEFINED_REFS.has(name)) continue;
      const arr = found.get(name) ?? [];
      arr.push(idx + 1);
      found.set(name, arr);
    }
  });
  const refs = Array.from(found.keys()).sort();
  const allLines = new Set<number>();
  for (const list of found.values()) for (const n of list) allLines.add(n);
  return { refs, lines: Array.from(allLines).sort((a, b) => a - b) };
}
