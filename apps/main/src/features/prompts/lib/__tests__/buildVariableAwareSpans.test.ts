import { describe, expect, it } from 'vitest';

import {
  buildCandidateSpans,
  buildVariableAwareSpans,
  type VariableSpanInput,
} from '../buildCandidateSpans';
import type { PromptBlockCandidate } from '../types';

function cand(text: string, start: number, end: number, role = 'action'): PromptBlockCandidate {
  return { text, role, start_pos: start, end_pos: end };
}

function variable(
  name: string,
  from: number,
  to: number,
  opts: { saved?: boolean; defaultClass?: boolean } = {},
): VariableSpanInput {
  return { name, from, to, saved: opts.saved ?? false, defaultClass: opts.defaultClass ?? false };
}

/** Concatenated span text must always reconstruct the prompt exactly. */
function assertFullCoverage(prompt: string, spans: { text: string }[]) {
  expect(spans.map((s) => s.text).join('')).toBe(prompt);
}

describe('buildVariableAwareSpans', () => {
  it('falls back to buildCandidateSpans when there are no variables', () => {
    const prompt = 'a red hat here';
    const candidates = [cand('red hat', 2, 9)];
    expect(buildVariableAwareSpans(prompt, candidates, [])).toEqual(
      buildCandidateSpans(prompt, candidates),
    );
  });

  it('attaches a variable token sitting in a gap (no candidate)', () => {
    const prompt = 'ACTOR1 is here';
    const candidates = [cand('is here', 7, 14)];
    const vars = [variable('ACTOR1', 0, 6, { saved: true, defaultClass: true })];

    const spans = buildVariableAwareSpans(prompt, candidates, vars);
    assertFullCoverage(prompt, spans);

    const varSpan = spans.find((s) => s.variable);
    expect(varSpan).toMatchObject({
      start: 0,
      end: 6,
      text: 'ACTOR1',
      candidate: undefined,
      variable: { name: 'ACTOR1', saved: true, defaultClass: true },
    });
    // The candidate span is untouched and carries no variable.
    const candSpan = spans.find((s) => s.candidate);
    expect(candSpan).toMatchObject({ start: 7, end: 14, text: 'is here' });
    expect(candSpan?.variable).toBeUndefined();
  });

  it('splits a candidate so a variable inside it gets its own clickable segment', () => {
    const prompt = 'ACTOR1 smiles';
    const candidates = [cand('ACTOR1 smiles', 0, 13, 'subject')];
    const vars = [variable('ACTOR1', 0, 6, { saved: true })];

    const spans = buildVariableAwareSpans(prompt, candidates, vars);
    assertFullCoverage(prompt, spans);
    expect(spans).toHaveLength(2);

    // First segment is both the candidate (role tint) and the variable (token).
    expect(spans[0]).toMatchObject({
      start: 0,
      end: 6,
      candidate: { role: 'subject' },
      variable: { name: 'ACTOR1' },
    });
    // Remainder keeps the candidate but has no variable.
    expect(spans[1]).toMatchObject({ start: 6, end: 13, candidate: { role: 'subject' } });
    expect(spans[1].variable).toBeUndefined();
  });

  it('handles a variable that straddles a candidate boundary', () => {
    // candidate covers [7,14); variable covers [4,9) — overlaps the start.
    const prompt = 'one ACTOR1here';
    const candidates = [cand('1here', 7, 14)];
    const vars = [variable('ACTOR1', 4, 9)];

    const spans = buildVariableAwareSpans(prompt, candidates, vars);
    assertFullCoverage(prompt, spans);

    // Segment [4,7): variable only. Segment [7,9): variable AND candidate.
    const varOnly = spans.find((s) => s.start === 4);
    expect(varOnly).toMatchObject({ end: 7, variable: { name: 'ACTOR1' }, candidate: undefined });
    const overlap = spans.find((s) => s.start === 7);
    expect(overlap).toMatchObject({ end: 9, variable: { name: 'ACTOR1' } });
    expect(overlap?.candidate).toBeDefined();
  });

  it('drops out-of-range variable ranges and keeps coverage intact', () => {
    const prompt = 'short';
    const spans = buildVariableAwareSpans(prompt, [], [variable('X', 2, 99)]);
    assertFullCoverage(prompt, spans);
  });
});
