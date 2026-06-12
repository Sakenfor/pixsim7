import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import type { PromptTokenLine } from '../../hooks/useShadowAnalysis';
import { collectOperatorRanges } from '../operatorEditExtension';

/** Build a single chain line; element/operator char ranges are caller-supplied
 *  to mirror what the backend tokenizer emits. */
function chainLine(
  elements: Array<{ kind: 'var' | 'prose'; text: string; start: number; end: number }>,
  operators: Array<{ op: string; run: number; op_start: number; op_end: number }>,
): PromptTokenLine {
  return {
    kind: 'chain',
    elements,
    operators,
    start: elements[0]?.start ?? 0,
    end: elements[elements.length - 1]?.end ?? 0,
  };
}

describe('collectOperatorRanges — access (`_`) operators', () => {
  it('emits an access range at the `_` of an ENTITY_FACET var', () => {
    // "ACTOR1_HIP" — `_` at index 6.
    const doc = Text.of(['ACTOR1_HIP']);
    const ranges = collectOperatorRanges(
      [chainLine([{ kind: 'var', text: 'ACTOR1_HIP', start: 0, end: 10 }], [])],
      doc,
    );
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({
      from: 6,
      to: 7,
      raw: '_',
      run: 1,
      context: 'access',
      access: { varName: 'ACTOR1_HIP', className: 'ACTOR', facet: 'HIP' },
    });
    expect(doc.sliceString(ranges[0].from, ranges[0].to)).toBe('_');
  });

  it('accounts for leading whitespace in the element slot', () => {
    // "ACTOR1_HIP < ACTOR2_HIP"; element 1 slot includes the leading space.
    const doc = Text.of(['ACTOR1_HIP < ACTOR2_HIP']);
    const ranges = collectOperatorRanges(
      [
        chainLine(
          [
            { kind: 'var', text: 'ACTOR1_HIP', start: 0, end: 10 },
            { kind: 'var', text: 'ACTOR2_HIP', start: 12, end: 23 },
          ],
          [{ op: '<', run: 1, op_start: 11, op_end: 12 }],
        ),
      ],
      doc,
    );
    // Sorted by `from`: ACTOR1's `_` (6), the `<` relation op (11), ACTOR2's `_` (19).
    expect(ranges.map((r) => [r.from, r.context])).toEqual([
      [6, 'access'],
      [11, 'chain'],
      [19, 'access'],
    ]);
    expect(doc.sliceString(19, 20)).toBe('_');
  });

  it('skips entity-only vars and degenerate leading/trailing underscores', () => {
    const doc = Text.of(['ACTOR1 _LEAD TRAIL_']);
    const ranges = collectOperatorRanges(
      [
        chainLine(
          [
            { kind: 'var', text: 'ACTOR1', start: 0, end: 6 },
            { kind: 'var', text: '_LEAD', start: 7, end: 12 },
            { kind: 'var', text: 'TRAIL_', start: 13, end: 19 },
          ],
          [],
        ),
      ],
      doc,
    );
    expect(ranges).toHaveLength(0);
  });

  it('emits for unrecognised classes too (recognition is popover-side)', () => {
    const doc = Text.of(['FOO_BAR']);
    const ranges = collectOperatorRanges(
      [chainLine([{ kind: 'var', text: 'FOO_BAR', start: 0, end: 7 }], [])],
      doc,
    );
    expect(ranges).toHaveLength(1);
    expect(ranges[0].access).toMatchObject({ className: 'FOO', facet: 'BAR' });
  });

  it('decorates only the first `_` of a multi-facet var', () => {
    // "ACTOR1_UPPER_BODY" — first `_` at index 6 is the entity↔facet boundary.
    const doc = Text.of(['ACTOR1_UPPER_BODY']);
    const ranges = collectOperatorRanges(
      [chainLine([{ kind: 'var', text: 'ACTOR1_UPPER_BODY', start: 0, end: 17 }], [])],
      doc,
    );
    const access = ranges.filter((r) => r.context === 'access');
    expect(access).toHaveLength(1);
    expect(access[0]).toMatchObject({ from: 6, access: { facet: 'UPPER' } });
  });
});
