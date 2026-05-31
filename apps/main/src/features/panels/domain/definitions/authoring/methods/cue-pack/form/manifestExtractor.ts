/**
 * Extract the `manifest:` block from raw CUE source so it can be
 * preserved verbatim across Builder-driven regenerations.
 *
 * We don't parse CUE — we anchor on the canonical pack/manifest
 * structure produced by `buildStarterCueSource()` and by the
 * convention used in tools/cue/prompt_packs/core_*.cue.
 *
 * Strategy: find the line that begins with `manifest:` at column 0
 * (i.e. not nested), then capture from that line to either the next
 * top-level expression `^[a-z][a-z0-9_]*:` or end of file.
 *
 * If extraction is ambiguous or fails, return null — the Builder
 * surfaces this as a caveat and refuses to regenerate until the
 * user accepts the loss.
 */

export interface ExtractedManifest {
  text: string;
  /** 1-based line range [startLine, endLine] in the original source. */
  range: [number, number];
}

const MANIFEST_OPEN = /^manifest\s*:/;
const TOP_LEVEL_EXPR = /^[a-z][a-z0-9_]*\s*:/;

export function extractManifestSection(source: string): ExtractedManifest | null {
  const lines = source.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (MANIFEST_OPEN.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    // Skip lines inside a string or block; this regex is just an
    // anchor check on the *start* of a line, which is good enough
    // for the canonical formatting we emit and for hand-written
    // packs that follow the core_*.cue convention.
    if (TOP_LEVEL_EXPR.test(lines[i])) {
      end = i;
      break;
    }
  }
  // Trim trailing blank lines from the captured block.
  while (end > start + 1 && lines[end - 1].trim() === '') end--;
  if (end <= start) return null;
  return {
    text: lines.slice(start, end).join('\n'),
    range: [start + 1, end],
  };
}
