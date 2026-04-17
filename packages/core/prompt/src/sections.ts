/**
 * Prompt section detection and section-block model.
 *
 * Mirrors the five built-in patterns from the backend SimplePromptParser
 * (`BUILTIN_SECTION_PATTERNS` in `services/prompt/parser/simple.py`).
 * Pure TS — no UI dependencies.
 */

export type PatternId =
  | 'colon'
  | 'assignment'
  | 'assignment_arrow'
  | 'angle_bracket'
  | 'freestanding';

export interface DetectedSection {
  label: string;
  patternId: PatternId;
  headerRange: [number, number];
  bodyRange: [number, number];
}

/**
 * A section block: an explicitly labelled prompt segment with a known
 * separator style.  The UI layer extends this with an `id` field.
 */
export interface PromptSectionBlock {
  label: string;
  body: string;
  sep: PatternId;
}

const PATTERNS: Array<{ id: PatternId; regex: RegExp }> = [
  { id: 'colon',            regex: /^[ \t]*([A-Z][A-Za-z /&-]{1,38}?)\s*:\s*$/gm },
  { id: 'assignment',       regex: /^[ \t]*([A-Z][A-Z0-9_]{1,58}?)\s*=\s*/gm },
  // Requires whitespace before the arrow so focal chains (NAME>OTHER>X) don't match.
  { id: 'assignment_arrow', regex: /^[ \t]*([A-Z][A-Z0-9_]{1,58}?)[ \t]+>+\s*/gm },
  { id: 'angle_bracket',    regex: /^[ \t]*>\s*([A-Z][A-Z /&-]+?)\s*<\s*$/gm },
  { id: 'freestanding',     regex: /^[ \t]*([A-Z][A-Z0-9_]{2,40})\s*$/gm },
];

export const DEFAULT_ACTIVE_PATTERNS: PatternId[] = [
  'colon',
  'assignment',
  'assignment_arrow',
  'angle_bracket',
  'freestanding',
];

export function detectPromptSections(
  text: string,
  activeIds: PatternId[] = DEFAULT_ACTIVE_PATTERNS,
): DetectedSection[] {
  if (!text) return [];

  const active = PATTERNS.filter((p) => activeIds.includes(p.id));

  const raw: Array<{ start: number; end: number; label: string; patternId: PatternId }> = [];
  for (const { id, regex } of active) {
    for (const m of text.matchAll(regex)) {
      if (m.index === undefined || !m[1]) continue;
      raw.push({ start: m.index, end: m.index + m[0].length, label: m[1].trim(), patternId: id });
    }
  }

  raw.sort((a, b) => a.start - b.start);

  // Remove overlapping matches — keep the first winner per position.
  const winners: typeof raw = [];
  for (const m of raw) {
    if (winners.length === 0 || m.start >= winners[winners.length - 1].end) {
      winners.push(m);
    }
  }

  return winners.map((m, i) => ({
    label: m.label,
    patternId: m.patternId,
    headerRange: [m.start, m.end] as [number, number],
    bodyRange: [m.end, i + 1 < winners.length ? winners[i + 1].start : text.length] as [number, number],
  }));
}

/**
 * Parse a prompt string into section blocks.
 * Sections without a recognised header are skipped; use `detectPromptSections`
 * directly if you need the unlabelled preamble too.
 */
export function parseSectionBlocks(
  text: string,
  activeIds?: PatternId[],
): PromptSectionBlock[] {
  return detectPromptSections(text, activeIds).map((s) => ({
    label: s.label,
    body: text.slice(s.bodyRange[0], s.bodyRange[1]).trim(),
    sep: s.patternId,
  }));
}

/** Serialize a single section block back to its header+body string. */
export function formatSectionBlock(block: PromptSectionBlock): string {
  const { label, body, sep } = block;
  switch (sep) {
    case 'colon':            return `${label}:\n${body}`;
    case 'assignment':       return `${label} = ${body}`;
    case 'assignment_arrow': return `${label} > ${body}`;
    case 'angle_bracket':    return `>${label}<\n${body}`;
    case 'freestanding':     return `${label}\n${body}`;
    default:                 return `${label}:\n${body}`;
  }
}

/** Compose an ordered list of section blocks into a full prompt string. */
export function composePromptFromSectionBlocks(blocks: PromptSectionBlock[]): string {
  return blocks.map(formatSectionBlock).join('\n');
}
