import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import type { PromptTokenLine } from '../../hooks/useShadowAnalysis';
import type { FacetVocab } from '../facetRecognition';
import { collectVariableRanges, type VariableTokensConfig } from '../variableTokenExtension';

const VOCAB: FacetVocab = {
  parts: [{ id: 'part:hip', label: 'Hip', keywords: ['hip', 'hips'] }],
};

/** One chain line with a single var element spanning the whole doc text. */
function varLine(text: string): PromptTokenLine {
  return {
    kind: 'chain',
    elements: [{ kind: 'var', text, start: 0, end: text.length }],
    operators: [],
    start: 0,
    end: text.length,
  };
}

function rangesFor(text: string, facetVocab: FacetVocab = VOCAB) {
  const config: VariableTokensConfig = {
    tokenLines: [varLine(text)],
    savedNames: new Set<string>(),
    facetVocab,
  };
  return collectVariableRanges(config, Text.of([text]));
}

describe('collectVariableRanges — facet sub-range', () => {
  it('marks a known axis facet (POSE) after the `_`', () => {
    const [r] = rangesFor('ACTOR1_POSE');
    expect(r.facet).toEqual({ from: 7, to: 11, known: true });
  });

  it('marks a concrete vocab value (HIP) as known via the class axis', () => {
    const [r] = rangesFor('ACTOR1_HIP');
    expect(r.facet).toEqual({ from: 7, to: 10, known: true });
  });

  it('marks an unrecognised-within-class facet as not-known', () => {
    const [r] = rangesFor('ACTOR1_NOPE');
    expect(r.facet).toMatchObject({ from: 7, known: false });
  });

  it('falls back to unknown for a concrete value when no vocab is supplied', () => {
    // Axis names still resolve without vocab; concrete values can't.
    expect(rangesFor('ACTOR1_HIP', {})[0].facet).toMatchObject({ known: false });
    expect(rangesFor('ACTOR1_POSE', {})[0].facet).toMatchObject({ known: true });
  });

  it('sets no facet for bare entities, facetless classes, or non-classes', () => {
    expect(rangesFor('ACTOR1').at(0)?.facet).toBeUndefined();
    expect(rangesFor('GOAL_X').at(0)?.facet).toBeUndefined();
    expect(rangesFor('FOO_BAR').at(0)?.facet).toBeUndefined();
  });
});
