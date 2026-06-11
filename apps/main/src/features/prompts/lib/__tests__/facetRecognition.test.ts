import { describe, expect, it } from 'vitest';

import {
  type FacetVocab,
  resolveFacet,
  resolveVariableFacet,
  suggestFacets,
} from '../facetRecognition';

const VOCAB: FacetVocab = {
  parts: [
    { id: 'part:hip', label: 'Hip', keywords: ['hip', 'hips'] },
    { id: 'part:upper_body', label: 'Upper Body', keywords: ['upper body', 'torso'] },
  ],
  poses: [{ id: 'pose:standing_neutral', label: 'Standing Neutral', keywords: ['standing'] }],
};

describe('resolveFacet', () => {
  it('keeps axis-level recognition for a known axis name (no value)', () => {
    const r = resolveFacet('ACTOR', 'POSE', VOCAB);
    expect(r).toMatchObject({ facet: 'POSE', known: true, axis: { name: 'POSE' } });
    expect(r.valueId).toBeUndefined();
  });

  it('resolves a concrete value to its vocab member + owning axis', () => {
    expect(resolveFacet('ACTOR', 'HIP', VOCAB)).toMatchObject({
      facet: 'HIP',
      known: true,
      axis: { name: 'ANATOMY' },
      valueId: 'part:hip',
      valueLabel: 'Hip',
    });
  });

  it('matches a multi-segment value via id suffix or keyword', () => {
    expect(resolveFacet('ACTOR', 'UPPER_BODY', VOCAB)).toMatchObject({ valueId: 'part:upper_body' });
    // 'torso' is a keyword of the same member.
    expect(resolveFacet('ACTOR', 'TORSO', VOCAB)).toMatchObject({ valueId: 'part:upper_body' });
  });

  it('reports unknown for a token matching no axis or vocab value', () => {
    expect(resolveFacet('ACTOR', 'XYZZY', VOCAB)).toMatchObject({ known: false });
  });

  it('does not resolve values for a freeform-only class (no vocab axes)', () => {
    // GOAL has no facet axes at all.
    expect(resolveFacet('GOAL', 'HIP', VOCAB)).toMatchObject({ known: false });
  });
});

describe('resolveVariableFacet', () => {
  it('resolves the leading facet of a full name', () => {
    expect(resolveVariableFacet('ACTOR1_HIP', VOCAB)).toMatchObject({ valueId: 'part:hip' });
  });
  it('returns null when the name has no facet', () => {
    expect(resolveVariableFacet('ACTOR1', VOCAB)).toBeNull();
  });
});

describe('suggestFacets', () => {
  it('lists axis names then vocab values for an empty partial', () => {
    const all = suggestFacets('ACTOR', '', VOCAB);
    const axisNames = all.filter((s) => s.kind === 'axis').map((s) => s.value);
    expect(axisNames).toEqual(['ANATOMY', 'POSE', 'PERSONALITY', 'DETAILS', 'OUTFIT', 'ROLE', 'GOAL']);
    // Concrete values surface too.
    expect(all.some((s) => s.kind === 'value' && s.value === 'HIP')).toBe(true);
    expect(all.some((s) => s.value === 'UPPER_BODY')).toBe(true);
  });

  it('prefix-matches the partial against axes and values', () => {
    const hi = suggestFacets('ACTOR', 'hi', VOCAB);
    expect(hi.map((s) => s.value)).toContain('HIP');
    expect(hi.some((s) => s.value === 'POSE')).toBe(false);

    const po = suggestFacets('ACTOR', 'po', VOCAB);
    expect(po.map((s) => s.value)).toContain('POSE');
  });

  it('matches a value through its keyword', () => {
    // 'standing' is a keyword of pose:standing_neutral.
    const s = suggestFacets('ACTOR', 'standing', VOCAB);
    expect(s.map((x) => x.value)).toContain('STANDING_NEUTRAL');
  });

  it('returns nothing for a class with no axes', () => {
    expect(suggestFacets('GOAL', '', VOCAB)).toEqual([]);
  });
});
