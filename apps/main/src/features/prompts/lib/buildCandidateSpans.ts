/**
 * Build text spans from prompt analysis candidates.
 *
 * Shared utility used by both PromptInlineViewer (for the read-only
 * highlighted view) and ShadowTextarea (for the editable highlight
 * backdrop). Fills gaps with unstyled spans for complete text coverage.
 */
import type { PromptBlockCandidate } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CandidateSpan {
  text: string;
  start: number;
  end: number;
  /** The source candidate, present only for positioned matches */
  candidate?: PromptBlockCandidate;
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build text spans from candidates with position data.
 * Candidates without valid `start_pos`/`end_pos` are ignored.
 * Gaps between positioned candidates are filled with unstyled spans.
 */
export function buildCandidateSpans(
  prompt: string,
  candidates: PromptBlockCandidate[],
): CandidateSpan[] {
  const positioned = candidates.filter(
    (c) => typeof c.start_pos === 'number' && typeof c.end_pos === 'number',
  );

  if (positioned.length === 0) {
    return [{ text: prompt, start: 0, end: prompt.length }];
  }

  const sorted = [...positioned].sort((a, b) => a.start_pos! - b.start_pos!);
  const spans: CandidateSpan[] = [];
  let cursor = 0;

  for (const seg of sorted) {
    const start = seg.start_pos!;
    const end = seg.end_pos!;

    // Gap span before this candidate
    if (start > cursor) {
      spans.push({
        text: prompt.slice(cursor, start),
        start: cursor,
        end: start,
      });
    }

    // Candidate span
    spans.push({
      text: prompt.slice(start, end),
      start,
      end,
      candidate: seg,
    });

    cursor = end;
  }

  // Trailing gap
  if (cursor < prompt.length) {
    spans.push({
      text: prompt.slice(cursor),
      start: cursor,
      end: prompt.length,
    });
  }

  return spans;
}
