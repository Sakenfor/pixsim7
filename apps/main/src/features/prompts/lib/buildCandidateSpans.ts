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

/** A variable token overlaid on the prompt text (from the backend tokenizer). */
export interface VariableSpanInput {
  from: number;
  to: number;
  name: string;
  saved: boolean;
  defaultClass: boolean;
}

/** Variable info attached to a rendered span (positions live on the span). */
export type PromptVariableSpan = Omit<VariableSpanInput, 'from' | 'to'>;

export interface CandidateSpan {
  text: string;
  start: number;
  end: number;
  /** The source candidate, present only for positioned matches */
  candidate?: PromptBlockCandidate;
  /** Variable token covering this span, when one applies (inline viewer only). */
  variable?: PromptVariableSpan;
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

/**
 * Build text spans from candidates AND variable token ranges, producing atomic
 * segments split at every candidate and variable boundary. Each segment carries
 * the candidate (role tint) and/or variable (clickable token) that covers it.
 *
 * Used by PromptInlineViewer when variable click-to-save is enabled — it lets a
 * variable token render its own affordance even when it sits inside a role span
 * (or straddles one). Candidate/variable ranges are both in the coordinate
 * space of the full `prompt` string. When `variables` is empty this is
 * equivalent to {@link buildCandidateSpans}.
 */
export function buildVariableAwareSpans(
  prompt: string,
  candidates: PromptBlockCandidate[],
  variables: VariableSpanInput[],
): CandidateSpan[] {
  if (variables.length === 0) return buildCandidateSpans(prompt, candidates);

  const positioned = candidates
    .filter((c) => typeof c.start_pos === 'number' && typeof c.end_pos === 'number')
    .map((c) => ({ start: c.start_pos!, end: c.end_pos!, candidate: c }))
    .sort((a, b) => a.start - b.start);

  const vars = variables
    .filter((v) => v.from < v.to && v.from >= 0 && v.to <= prompt.length)
    .sort((a, b) => a.from - b.from);

  if (vars.length === 0) return buildCandidateSpans(prompt, candidates);

  // Cut points: every candidate/variable edge plus the document bounds. The
  // sorted unique set yields the atomic intervals to emit.
  const cuts = new Set<number>([0, prompt.length]);
  for (const c of positioned) {
    if (c.start > 0 && c.start < prompt.length) cuts.add(c.start);
    if (c.end > 0 && c.end < prompt.length) cuts.add(c.end);
  }
  for (const v of vars) {
    if (v.from > 0 && v.from < prompt.length) cuts.add(v.from);
    if (v.to > 0 && v.to < prompt.length) cuts.add(v.to);
  }
  const points = Array.from(cuts).sort((a, b) => a - b);

  const spans: CandidateSpan[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a >= b) continue;
    // First range whose half-open interval contains the segment start.
    const cand = positioned.find((c) => c.start <= a && a < c.end)?.candidate;
    const v = vars.find((r) => r.from <= a && a < r.to);
    spans.push({
      text: prompt.slice(a, b),
      start: a,
      end: b,
      candidate: cand,
      variable: v ? { name: v.name, saved: v.saved, defaultClass: v.defaultClass } : undefined,
    });
  }
  return spans;
}
