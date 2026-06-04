import { describe, expect, it } from 'vitest';

import {
  matchRecipe,
  varSemanticKind,
  type RelationRecipe,
} from '../useRelationRecipes';

describe('varSemanticKind', () => {
  it('strips a trailing numeric index to the name family', () => {
    expect(varSemanticKind('ACTOR1')).toBe('ACTOR');
    expect(varSemanticKind('ACTOR2')).toBe('ACTOR');
    expect(varSemanticKind('ACTOR_2')).toBe('ACTOR');
    expect(varSemanticKind('ACTOR12')).toBe('ACTOR');
  });

  it('uppercases and passes through indexless names', () => {
    expect(varSemanticKind('scene')).toBe('SCENE');
    expect(varSemanticKind('TARGET')).toBe('TARGET');
  });

  it('returns undefined for empty / index-only input', () => {
    expect(varSemanticKind('')).toBeUndefined();
    expect(varSemanticKind(undefined)).toBeUndefined();
    expect(varSemanticKind(null)).toBeUndefined();
    expect(varSemanticKind('123')).toBeUndefined();
  });
});

describe('matchRecipe tiers', () => {
  const typed: RelationRecipe = {
    id: 'chain_actor_to_actor',
    label: 'Character interaction',
    context: { line_kind: 'chain', prev_kind: 'var', next_kind: 'var', lhs_kind: 'ACTOR', rhs_kind: 'ACTOR' },
    operators: [{ op: '>', swap_targets: ['>'] }],
  };
  const generic: RelationRecipe = {
    id: 'chain_var_to_var',
    label: 'Relation chain',
    context: { line_kind: 'chain', prev_kind: 'var', next_kind: 'var' },
    operators: [{ op: '>', swap_targets: ['>'] }],
  };
  const colon: RelationRecipe = {
    id: 'header_colon',
    label: 'Section header',
    context: { line_kind: 'colon' },
    operators: [{ op: ':', swap_targets: [':'] }],
  };
  const recipes = [typed, generic, colon];

  it('tier 1: returns the typed recipe when both var kinds match', () => {
    expect(
      matchRecipe(recipes, {
        line_kind: 'chain',
        prev_kind: 'var',
        next_kind: 'var',
        lhs_kind: 'ACTOR',
        rhs_kind: 'ACTOR',
      }),
    ).toBe(typed);
  });

  it('tier 2: falls back to the generic var→var recipe for a non-matching var pair', () => {
    expect(
      matchRecipe(recipes, {
        line_kind: 'chain',
        prev_kind: 'var',
        next_kind: 'var',
        lhs_kind: 'ACTOR',
        rhs_kind: 'SCENE',
      }),
    ).toBe(generic);
  });

  it('tier 2: never returns a typed recipe when no var kinds are supplied', () => {
    expect(
      matchRecipe(recipes, { line_kind: 'chain', prev_kind: 'var', next_kind: 'var' }),
    ).toBe(generic);
  });

  it('tier 3: falls back to a line_kind-only recipe', () => {
    expect(matchRecipe(recipes, { line_kind: 'colon' })).toBe(colon);
  });

  it('returns null when nothing matches', () => {
    expect(matchRecipe(recipes, { line_kind: 'freestanding' })).toBeNull();
  });
});
