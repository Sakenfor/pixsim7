/**
 * Client-side prompt section splitter for the Prompt Test Suite panel.
 *
 * Mirrors the four built-in patterns from the backend `SimplePromptParser`
 * (`BUILTIN_SECTION_PATTERNS` in `services/prompt/parser/simple.py`).
 * Kept client-side for instant feedback as the user types in the editor.
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

const PATTERNS: Array<{ id: PatternId; regex: RegExp }> = [
  { id: 'colon', regex: /^[ \t]*([A-Z][A-Za-z /&\-]{1,38}?)\s*:\s*$/gm },
  { id: 'assignment', regex: /^[ \t]*([A-Z][A-Z0-9_]{1,58}?)\s*=\s*/gm },
  // Arrow-assignment requires whitespace before the arrow so focal chains
  // (`NAME>OTHER>X`) don't false-match.
  { id: 'assignment_arrow', regex: /^[ \t]*([A-Z][A-Z0-9_]{1,58}?)[ \t]+>+\s*/gm },
  { id: 'angle_bracket', regex: /^[ \t]*>\s*([A-Z][A-Z /&\-]+?)\s*<\s*$/gm },
  { id: 'freestanding', regex: /^[ \t]*([A-Z][A-Z0-9_]{2,40})\s*$/gm },
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
    const matches = Array.from(text.matchAll(regex));
    for (const m of matches) {
      if (m.index === undefined || !m[1]) continue;
      raw.push({
        start: m.index,
        end: m.index + m[0].length,
        label: m[1].trim(),
        patternId: id,
      });
    }
  }

  raw.sort((a, b) => a.start - b.start);

  const matches: typeof raw = [];
  for (const m of raw) {
    if (matches.length === 0 || m.start >= matches[matches.length - 1].end) {
      matches.push(m);
    }
  }

  return matches.map((m, i) => ({
    label: m.label,
    patternId: m.patternId,
    headerRange: [m.start, m.end] as [number, number],
    bodyRange: [m.end, i + 1 < matches.length ? matches[i + 1].start : text.length] as [number, number],
  }));
}

export const PATTERN_COLORS: Record<PatternId, string> = {
  colon: '#a78bfa',
  assignment: '#60a5fa',
  assignment_arrow: '#22d3ee',
  angle_bracket: '#34d399',
  freestanding: '#fbbf24',
};
