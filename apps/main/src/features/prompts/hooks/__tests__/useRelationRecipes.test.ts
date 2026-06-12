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

describe('matchRecipe facet tier', () => {
  const facetTyped: RelationRecipe = {
    id: 'chain_actor_hip_to_actor_hip',
    label: 'Hip alignment',
    context: {
      line_kind: 'chain',
      prev_kind: 'var',
      next_kind: 'var',
      lhs_kind: 'ACTOR',
      rhs_kind: 'ACTOR',
      lhs_facet: 'HIP',
      rhs_facet: 'HIP',
    },
    operators: [{ op: '<', swap_targets: ['<'] }],
  };
  const typed: RelationRecipe = {
    id: 'chain_actor_to_actor',
    context: { line_kind: 'chain', prev_kind: 'var', next_kind: 'var', lhs_kind: 'ACTOR', rhs_kind: 'ACTOR' },
    operators: [{ op: '<', swap_targets: ['<'] }],
  };
  const recipes = [facetTyped, typed];
  const base = {
    line_kind: 'chain',
    prev_kind: 'var',
    next_kind: 'var',
    lhs_kind: 'ACTOR',
    rhs_kind: 'ACTOR',
  } as const;

  it('tier 0: matches the facet-typed recipe when both facets match', () => {
    expect(matchRecipe(recipes, { ...base, lhs_facet: 'HIP', rhs_facet: 'HIP' })).toBe(facetTyped);
  });

  it('tier 1: falls back to the class-typed recipe when facets differ', () => {
    expect(matchRecipe(recipes, { ...base, lhs_facet: 'HIP', rhs_facet: 'SHOULDER' })).toBe(typed);
  });

  it('tier 1: a facet recipe is never chosen for facetless operands', () => {
    expect(matchRecipe(recipes, base)).toBe(typed);
  });
});

describe('matchRecipe generation-scope gates', () => {
  const typed: RelationRecipe = {
    id: 'chain_actor_to_actor',
    context: { line_kind: 'chain', prev_kind: 'var', next_kind: 'var', lhs_kind: 'ACTOR', rhs_kind: 'ACTOR' },
    operators: [{ op: '>', swap_targets: ['>'] }],
  };
  const generic: RelationRecipe = {
    id: 'chain_var_to_var',
    context: { line_kind: 'chain', prev_kind: 'var', next_kind: 'var' },
    operators: [{ op: '>', swap_targets: ['>'] }],
  };
  const scopedOp: RelationRecipe = {
    id: 'chain_var_to_var_i2v',
    context: { line_kind: 'chain', prev_kind: 'var', next_kind: 'var', operation_types: ['image_to_video'] },
    operators: [{ op: '>', swap_targets: ['>'] }],
  };
  const scopedModel: RelationRecipe = {
    id: 'chain_var_to_var_pixverse',
    context: { line_kind: 'chain', prev_kind: 'var', next_kind: 'var', models: ['pixverse-i2v-v6'] },
    operators: [{ op: '>', swap_targets: ['>'] }],
  };
  const recipes = [scopedOp, scopedModel, generic, typed];
  const varVar = { line_kind: 'chain', prev_kind: 'var', next_kind: 'var' } as const;

  it('prefers an operation-scoped recipe when the operation matches', () => {
    expect(matchRecipe(recipes, { ...varVar, operation_type: 'image_to_video' })).toBe(scopedOp);
  });

  it('prefers a model-scoped recipe when the model matches', () => {
    expect(matchRecipe(recipes, { ...varVar, model_id: 'pixverse-i2v-v6' })).toBe(scopedModel);
  });

  it('falls back to the unscoped recipe when no scope matches', () => {
    expect(matchRecipe(recipes, { ...varVar, operation_type: 'text_to_image' })).toBe(generic);
    expect(matchRecipe(recipes, varVar)).toBe(generic);
  });

  it('keeps structural specificity primary (typed beats a scoped generic)', () => {
    // ACTOR↔ACTOR on i2v still resolves to the typed recipe, not the
    // operation-scoped generic var→var.
    expect(
      matchRecipe(recipes, {
        ...varVar,
        lhs_kind: 'ACTOR',
        rhs_kind: 'ACTOR',
        operation_type: 'image_to_video',
      }),
    ).toBe(typed);
  });
});
