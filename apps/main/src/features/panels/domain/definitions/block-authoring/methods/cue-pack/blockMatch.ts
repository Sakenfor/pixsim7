/**
 * Match helpers for cross-panel block selection.
 *
 * `CAP_BLOCK_SELECTION` delivers the user's currently-focused block
 * as a fully-qualified id (e.g. "core.camera.angle.eye_level").
 * Drafts being authored have blocks with an `id_prefix` (e.g.
 * "core.camera.angle") that the variants extend.
 *
 * These helpers map the incoming selection to the matching block in
 * the local draft so the editor surfaces (Source, Builder, Outline)
 * can react.
 *
 * Pure functions — easy to test, no React.
 */

/**
 * True when the supplied `id_prefix` matches the incoming selection.
 * A block matches if the selected id is the prefix itself or extends
 * it with a dot (a variant key).
 */
export function blockIdPrefixMatchesSelection(
  idPrefix: string | null | undefined,
  selectedBlockId: string | null | undefined,
): boolean {
  if (!idPrefix || !selectedBlockId) return false;
  if (idPrefix === selectedBlockId) return true;
  return selectedBlockId.startsWith(`${idPrefix}.`);
}

/**
 * Find an offset in raw CUE source that corresponds to the supplied
 * fully-qualified selection. Tries the full id first, then walks back
 * by removing trailing dotted segments — so a selection of
 * `core.camera.angle.eye_level` will still locate a draft that only
 * mentions `id_prefix: "core.camera.angle"`.
 *
 * Returns null when no prefix of length >= 2 segments is found.
 */
export function findSelectionAnchor(
  source: string,
  selectedBlockId: string | null | undefined,
): { offset: number; matched: string } | null {
  if (!source || !selectedBlockId) return null;
  const parts = selectedBlockId.split('.');
  for (let n = parts.length; n >= 2; n--) {
    const probe = parts.slice(0, n).join('.');
    const offset = source.indexOf(probe);
    if (offset !== -1) return { offset, matched: probe };
  }
  return null;
}

/**
 * Convert a 0-based character offset in a multi-line string into the
 * 1-based (line, column) pair used by textareas.
 */
export function offsetToLineColumn(source: string, offset: number): {
  line: number;
  column: number;
} {
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line += 1;
      lastBreak = i;
    }
  }
  return { line, column: offset - lastBreak };
}
