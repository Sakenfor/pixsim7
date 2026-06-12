import { describe, expect, it } from 'vitest';

import { matchFacetTrigger } from '../facetTrigger';

describe('matchFacetTrigger', () => {
  it('arms right after the `_` with an empty partial', () => {
    expect(matchFacetTrigger('ACTOR1_')).toEqual({
      className: 'ACTOR',
      partial: '',
      partialStart: 7,
    });
  });

  it('captures the partial typed after the `_`', () => {
    expect(matchFacetTrigger('ACTOR1_HI')).toEqual({
      className: 'ACTOR',
      partial: 'HI',
      partialStart: 7,
    });
  });

  it('resolves the class from the entity index and respects a leading boundary', () => {
    // Entity preceded by a space → boundary ok; partialStart is absolute.
    expect(matchFacetTrigger('go ACTOR1_PO')).toEqual({
      className: 'ACTOR',
      partial: 'PO',
      partialStart: 10,
    });
    expect(matchFacetTrigger('SCENE_BE')).toMatchObject({ className: 'SCENE', partial: 'BE' });
    expect(matchFacetTrigger('CAMERA_AN')).toMatchObject({ className: 'CAMERA', partial: 'AN' });
  });

  it('keeps the multi-segment partial (matches from the first `_`)', () => {
    expect(matchFacetTrigger('ACTOR1_UPPER_BO')).toEqual({
      className: 'ACTOR',
      partial: 'UPPER_BO',
      partialStart: 7,
    });
  });

  it('does not arm for facetless classes', () => {
    // GOAL is a default class but declares no facet axes.
    expect(matchFacetTrigger('GOAL_X')).toBeNull();
  });

  it('does not arm without a `_`, for lowercase prose, or mid-identifier', () => {
    expect(matchFacetTrigger('ACTOR1')).toBeNull();
    expect(matchFacetTrigger('follow_up')).toBeNull();
    expect(matchFacetTrigger('xACTOR1_HI')).toBeNull();
  });
});
