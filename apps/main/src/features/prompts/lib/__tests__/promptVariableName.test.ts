import { describe, expect, it } from 'vitest';

import {
  allFacetVocabCategories,
  classifyFacet,
  facetAxesForClass,
  groupVariablesByEntity,
  isDefaultVariableClass,
  parseVariableName,
  recognizeVariableFacet,
} from '../promptVariableName';

describe('parseVariableName', () => {
  it('splits class, index, entity, and facet for ACTOR1_DETAILS', () => {
    expect(parseVariableName('ACTOR1_DETAILS')).toEqual({
      raw: 'ACTOR1_DETAILS',
      className: 'ACTOR',
      index: 1,
      entity: 'ACTOR1',
      facets: ['DETAILS'],
      facetPath: 'DETAILS',
    });
  });

  it('handles a bare indexed entity', () => {
    expect(parseVariableName('ACTOR2')).toMatchObject({
      className: 'ACTOR',
      index: 2,
      entity: 'ACTOR2',
      facets: [],
      facetPath: '',
    });
  });

  it('handles a class with no index', () => {
    expect(parseVariableName('GOAL')).toMatchObject({
      className: 'GOAL',
      index: null,
      entity: 'GOAL',
      facets: [],
    });
  });

  it('splits a multi-segment facet path', () => {
    expect(parseVariableName('ACTOR1_PERSONALITY_TONE')).toMatchObject({
      entity: 'ACTOR1',
      facets: ['PERSONALITY', 'TONE'],
      facetPath: 'PERSONALITY_TONE',
    });
  });

  it('normalizes case and whitespace', () => {
    expect(parseVariableName('  actor1_details  ')).toMatchObject({
      raw: 'ACTOR1_DETAILS',
      entity: 'ACTOR1',
    });
  });
});

describe('isDefaultVariableClass', () => {
  it('recognizes default classes regardless of index/facet', () => {
    expect(isDefaultVariableClass('ACTOR1')).toBe(true);
    expect(isDefaultVariableClass('ACTOR3_POSE')).toBe(true);
    expect(isDefaultVariableClass('GOAL')).toBe(true);
  });

  it('rejects non-default classes', () => {
    expect(isDefaultVariableClass('WIDGET1')).toBe(false);
  });
});

describe('facet recognition', () => {
  it('exposes declared axes for a class and none for facetless classes', () => {
    expect(facetAxesForClass('ACTOR').map((a) => a.name)).toEqual([
      'ANATOMY',
      'POSE',
      'PERSONALITY',
      'DETAILS',
      'OUTFIT',
      'ROLE',
      'GOAL',
    ]);
    expect(facetAxesForClass('GOAL')).toEqual([]);
    expect(facetAxesForClass('WIDGET')).toEqual([]);
  });

  it('classifies a known axis (case/space-insensitive) with its source', () => {
    expect(classifyFacet('ACTOR', 'pose ')).toMatchObject({
      facet: 'POSE',
      known: true,
      axis: { name: 'POSE', source: { kind: 'vocab', category: 'poses' } },
    });
    expect(classifyFacet('ACTOR', 'PERSONALITY')).toMatchObject({
      known: true,
      axis: { source: { kind: 'freeform' } },
    });
  });

  it('reports unknown for a concrete vocab value (axis-level recognition only)', () => {
    // HIP is an anatomy *value*, not an axis name — conservatively unknown until
    // the vocab resolver lands. Never a false positive.
    expect(classifyFacet('ACTOR', 'HIP')).toMatchObject({ facet: 'HIP', known: false });
    expect(classifyFacet('ACTOR', 'HIP').axis).toBeUndefined();
  });

  it('recognises the leading facet of a full name, null when facetless', () => {
    expect(recognizeVariableFacet('ACTOR1_POSE')).toMatchObject({ facet: 'POSE', known: true });
    // Leading segment is the axis; trailing segments are sub-path.
    expect(recognizeVariableFacet('ACTOR2_POSE_LEFT')).toMatchObject({
      facet: 'POSE',
      known: true,
    });
    expect(recognizeVariableFacet('ACTOR1')).toBeNull();
    expect(recognizeVariableFacet('GOAL')).toBeNull();
  });

  it('collects the distinct vocab categories across all default classes', () => {
    // Derived from the vocab-backed axes (parts/poses/locations/camera); deduped
    // (SCENE + SETTING both reference `locations`) and sorted. Freeform axes
    // (PERSONALITY, DETAILS, …) contribute nothing.
    expect(allFacetVocabCategories()).toEqual(['camera', 'locations', 'parts', 'poses']);
  });
});

describe('groupVariablesByEntity', () => {
  it('groups saved + detected by entity with bare-entity-first ordering', () => {
    const groups = groupVariablesByEntity(
      [
        { name: 'ACTOR1_DETAILS', description: 'backstory' },
        { name: 'ACTOR1', description: 'the lead' },
        { name: 'GOAL' },
      ],
      ['ACTOR1_POSE', 'ACTOR2'],
    );

    const actor1 = groups.find((g) => g.entity === 'ACTOR1');
    expect(actor1).toBeDefined();
    expect(actor1!.defaultClass).toBe(true);
    // Bare entity first, then facets alphabetical.
    expect(actor1!.members.map((m) => m.facetPath)).toEqual(['', 'DETAILS', 'POSE']);

    const pose = actor1!.members.find((m) => m.facetPath === 'POSE');
    expect(pose).toMatchObject({ saved: false, detected: true });

    const details = actor1!.members.find((m) => m.facetPath === 'DETAILS');
    expect(details).toMatchObject({ saved: true, detected: false, description: 'backstory' });

    // ACTOR2 only detected; still grouped.
    const actor2 = groups.find((g) => g.entity === 'ACTOR2');
    expect(actor2!.members).toHaveLength(1);
    expect(actor2!.members[0]).toMatchObject({ name: 'ACTOR2', saved: false, detected: true });

    // Groups sorted by entity.
    expect(groups.map((g) => g.entity)).toEqual(['ACTOR1', 'ACTOR2', 'GOAL']);
  });

  it('returns an empty array for no input', () => {
    expect(groupVariablesByEntity([], [])).toEqual([]);
  });
});
