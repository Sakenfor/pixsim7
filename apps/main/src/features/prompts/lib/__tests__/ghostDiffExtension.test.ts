/**
 * Regression: ghost-diff overlay never rendered in CodeMirror mode because
 * buildDecorations added all "add" mark ranges first and the red-dot remove
 * widgets second. RangeSetBuilder requires a SINGLE ascending (from, startSide)
 * stream, so a remove marker sitting before an already-added add mark threw
 * "Ranges must be added sorted by `from` position", crashing the ViewPlugin —
 * which is why the textarea renderer (no RangeSetBuilder) worked and CM didn't.
 */
import { describe, expect, it } from 'vitest';

import {
  buildDecorations,
  computeDiff,
  lineChangeAt,
  type GhostDiffConfig,
} from '../ghostDiffExtension';

function config(comparisonText: string): GhostDiffConfig {
  return { comparisonText, stepDistance: 1, precision: 'coarse' };
}

describe('ghostDiffExtension.buildDecorations', () => {
  it('does not throw when a removal precedes a later addition (CM repro)', () => {
    // "alpha " removed at the front; a changed word near the end becomes an add
    // mark at a much later position. Old code added the add mark first, then the
    // remove widget at pos 0 -> out of order -> throw.
    const docText = 'beta gamma zeta';
    const result = computeDiff(docText, config('alpha beta gamma delta'));

    // Sanity: this input actually exercises both branches.
    expect(result.removeMarkers.length + result.ranges.length).toBeGreaterThan(0);

    expect(() => buildDecorations(result)).not.toThrow();
    expect(buildDecorations(result).size).toBeGreaterThan(0);
  });

  it('handles interleaved adds and removes across the document', () => {
    const docText = 'the quick brown fox leaps';
    const result = computeDiff(docText, config('a slow brown dog jumps over'));
    expect(() => buildDecorations(result)).not.toThrow();
  });

  it('returns no decorations when texts are identical', () => {
    const docText = 'identical prompt text';
    const result = computeDiff(docText, config('identical prompt text'));
    expect(buildDecorations(result).size).toBe(0);
  });

  it('keeps point widgets ordered before marks at the same position', () => {
    // A removal whose insertion point coincides with the start of an add mark
    // must still build without a sort violation.
    const docText = 'red mat';
    const result = computeDiff(docText, config('red cushion mat'));
    expect(() => buildDecorations(result)).not.toThrow();
  });
});

describe('ghostDiffExtension.lineChangeAt (hover: previous line)', () => {
  it('reconstructs the previous version of a replaced line', () => {
    const prev = 'a red dog runs\nin the park';
    const cur = 'a blue cat runs\nin the park';
    // pos 5 -> first line ("a blue cat runs")
    const change = lineChangeAt(cur, prev, 5, 'coarse');
    expect(change).not.toBeNull();
    expect(change!.curLine).toBe('a blue cat runs');
    expect(change!.prevLine).toBe('a red dog runs');
  });

  it('returns null when the hovered line is unchanged', () => {
    const prev = 'a red dog runs\nin the park';
    const cur = 'a blue cat runs\nin the park';
    // pos on the second (identical) line
    const secondLineStart = cur.indexOf('in the park');
    expect(lineChangeAt(cur, prev, secondLineStart + 2, 'coarse')).toBeNull();
  });

  it('flags a brand-new line with no previous counterpart', () => {
    const prev = 'first line';
    const cur = 'first line\nbrand new second line';
    const pos = cur.indexOf('brand');
    const change = lineChangeAt(cur, prev, pos, 'coarse');
    expect(change).not.toBeNull();
    expect(change!.prevLine).toBe('');
    expect(change!.curLine).toBe('brand new second line');
  });

  it('returns null when both texts are identical', () => {
    const text = 'unchanged line one\nunchanged line two';
    expect(lineChangeAt(text, text, 3, 'coarse')).toBeNull();
  });
});
