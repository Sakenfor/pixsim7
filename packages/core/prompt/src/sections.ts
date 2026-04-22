/**
 * Prompt section detection and section-block model.
 *
 * Backed by the line-level grammar in `./grammar.ts` — no regex.
 * The grammar's lexer/parser is the single source of truth for what
 * counts as a section header; this file projects that into the legacy
 * `DetectedSection` / `PromptSectionBlock` shape consumed by the UI.
 */
import { lex, parseLines, type HeaderLine, type LineNode } from './grammar';

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

  const tokens = lex(text);
  const lines = parseLines(tokens, text);

  const active = new Set<PatternId>(activeIds);
  const headers: HeaderLine[] = lines.filter(
    (n): n is HeaderLine => n.kind === 'header' && active.has(n.pattern),
  );

  return headers.map((h, i) => {
    const nextStart = i + 1 < headers.length ? headers[i + 1].start : text.length;
    return {
      label: h.label,
      patternId: h.pattern,
      headerRange: [h.start, headerEnd(h)] as [number, number],
      bodyRange: [h.bodyStart, nextStart] as [number, number],
    };
  });
}

/**
 * For block-style headers the header span runs to the end of the line; for
 * inline headers (`assignment`, `assignment_arrow`) it runs up to where the
 * body starts. Mirrors the legacy regex behavior where the `headerRange`
 * for inline patterns ends at the operator+padding and `bodyRange` starts
 * immediately after.
 */
function headerEnd(h: HeaderLine): number {
  if (h.pattern === 'assignment' || h.pattern === 'assignment_arrow') {
    return h.bodyStart;
  }
  return h.end;
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

// Re-export grammar primitives so callers wanting raw tokens/AST
// can import them from the same module.
export type { Token, TokenKind, RunChar, LineNode, HeaderLine } from './grammar';
export { lex, parseLines } from './grammar';
