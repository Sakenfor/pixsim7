/**
 * Loads relation recipes from `/api/v1/prompts/meta/relation-recipes`.
 *
 * Recipes describe what the prompt grammar *knows about* — they enrich
 * the operator-edit popover with meaning, run-length semantics,
 * recommended swap targets, and free-form notes. Recipes are
 * suggestions, not validation rules: the grammar accepts any operator
 * combination; recipes only label recognised contexts.
 *
 * Cached at module level — recipes are static during a session.
 */
import { useEffect, useState } from 'react';

import { useApi } from '@/hooks/useApi';

export interface RelationRecipeNote {
  text: string;
  model?: string;
  author?: string;
  date?: string;
  tags?: string[];
}

export interface RelationRecipeOperator {
  op: string;
  meaning?: string;
  run_semantics?: Record<string, string>;
  swap_targets: string[];
  notes?: RelationRecipeNote[];
}

export type RecipeLineKind = 'chain' | 'colon' | 'angle_bracket' | 'freestanding';
export type ChainElementKind = 'var' | 'prose';

export interface RelationRecipeContext {
  /** Tokenizer line node kind. */
  line_kind?: RecipeLineKind;
  /** Element kind immediately before the clicked operator (chain only). */
  prev_kind?: ChainElementKind;
  /** Element kind immediately after the clicked operator (chain only). */
  next_kind?: ChainElementKind;
  /**
   * Semantic-kind of the var immediately before/after the operator — the
   * name family of the variable with any trailing index stripped
   * (`ACTOR1`/`ACTOR2` → `ACTOR`). Recipes that declare these match *only*
   * when both sides are vars of the named kinds, letting a relation like
   * `ACTOR ===> ACTOR` carry different semantics than the generic
   * var→var chain. See `varSemanticKind`.
   */
  lhs_kind?: string;
  rhs_kind?: string;
  /**
   * Facet-typed operands — the leading facet token of each side's var
   * (`ACTOR1_HIP` → `HIP`). A recipe declaring these matches *only* when both
   * sides carry the named facets, letting `ACTOR_HIP < ACTOR_HIP` (a spatial
   * relation over anatomy-typed operands) carry different semantics than a bare
   * `ACTOR < ACTOR`. Strictly more specific than lhs_kind/rhs_kind. No
   * recipe declares these yet — the slot-backed content is a follow-on; the
   * matcher tier is in place so authoring them is a data-only change.
   */
  lhs_facet?: string;
  rhs_facet?: string;
  /**
   * Generation-scope gates (operator-layer analog of an op signature's
   * allowed_modalities). A recipe declaring these is eligible only when the
   * active model / operation is in the list; absent = matches any. A scoped
   * recipe is preferred over an unscoped one within the same structural tier.
   */
  models?: string[];
  operation_types?: string[];
}

export interface RelationRecipe {
  id: string;
  label?: string;
  context: RelationRecipeContext;
  operators: RelationRecipeOperator[];
  notes?: RelationRecipeNote[];
}

export interface RelationRecipesPayload {
  version: string;
  recipes: RelationRecipe[];
}

const FALLBACK: RelationRecipesPayload = { version: '1.0.0', recipes: [] };

let cached: RelationRecipesPayload | null = null;
let inflight: Promise<RelationRecipesPayload> | null = null;

async function fetchRecipes(api: ReturnType<typeof useApi>): Promise<RelationRecipesPayload> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = api
    .get<RelationRecipesPayload>('/prompts/meta/relation-recipes')
    .then((data) => {
      cached = {
        version: data?.version ?? FALLBACK.version,
        recipes: Array.isArray(data?.recipes) ? data.recipes : [],
      };
      inflight = null;
      return cached;
    })
    .catch(() => {
      inflight = null;
      return FALLBACK;
    });

  return inflight;
}

export function useRelationRecipes(): RelationRecipesPayload {
  const api = useApi();
  const [data, setData] = useState<RelationRecipesPayload>(cached ?? FALLBACK);

  useEffect(() => {
    if (cached) return;
    let active = true;
    fetchRecipes(api).then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, [api]);

  return data;
}

/**
 * Normalize a variable's text to its semantic-kind family: uppercase and
 * strip a trailing numeric index (with optional separating underscore).
 * `ACTOR1` → `ACTOR`, `ACTOR_2` → `ACTOR`, `SCENE` → `SCENE`. Returns
 * `undefined` for empty/index-only input so callers can treat it as
 * "no semantic kind".
 */
export function varSemanticKind(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const family = text.trim().toUpperCase().replace(/_?\d+$/, '');
  return family || undefined;
}

/** True when the active generation model/operation passes a recipe's gates. */
function recipeModelEligible(
  recipe: RelationRecipe,
  modelId: string | undefined,
  operationType: string | undefined,
): boolean {
  const { models, operation_types } = recipe.context;
  if (models && models.length > 0 && !(modelId && models.includes(modelId))) return false;
  if (operation_types && operation_types.length > 0 && !(operationType && operation_types.includes(operationType))) {
    return false;
  }
  return true;
}

/** True when a recipe declares any generation-scope gate. */
function recipeIsScoped(recipe: RelationRecipe): boolean {
  return !!(recipe.context.models?.length || recipe.context.operation_types?.length);
}

/**
 * Find the best-matching recipe for a given context. Structural specificity is
 * the primary axis; generation-scope is the tiebreaker within each tier.
 * Resolution (most-specific first):
 *   0. (…lhs_kind, rhs_kind, lhs_facet, rhs_facet) — facet-typed relation.
 *   1. (line_kind, prev_kind, next_kind, lhs_kind, rhs_kind) — typed relation.
 *   2. (line_kind, prev_kind, next_kind) on recipes that do NOT declare lhs/rhs.
 *   3. line_kind alone (no prev/next constraints).
 *   4. null (caller falls back to grammar's universal swap_targets).
 * Recipes whose model/operation gates exclude the active context are dropped
 * up front; within each tier a model/operation-scoped recipe beats an unscoped
 * one (so an i2v overlay overrides the generic chain for that operation only).
 */
export function matchRecipe(
  recipes: RelationRecipe[],
  context: {
    line_kind: RecipeLineKind;
    prev_kind?: ChainElementKind;
    next_kind?: ChainElementKind;
    lhs_kind?: string;
    rhs_kind?: string;
    lhs_facet?: string;
    rhs_facet?: string;
    model_id?: string;
    operation_type?: string;
  },
): RelationRecipe | null {
  const eligible = recipes.filter((r) =>
    recipeModelEligible(r, context.model_id, context.operation_type),
  );
  // Within a structural candidate set, prefer a generation-scoped recipe.
  const pick = (pred: (r: RelationRecipe) => boolean): RelationRecipe | null => {
    const candidates = eligible.filter(pred);
    return candidates.find(recipeIsScoped) ?? candidates.find((r) => !recipeIsScoped(r)) ?? null;
  };

  // Tier 0: facet-typed relation (both sides are facet-typed vars). Strictly
  // more specific than Tier 1; only fires when a recipe declares matching
  // lhs_facet/rhs_facet (none do yet — slot-backed content is a follow-on).
  if (
    context.prev_kind && context.next_kind &&
    context.lhs_kind && context.rhs_kind &&
    context.lhs_facet && context.rhs_facet
  ) {
    const facetTyped = pick(
      (r) =>
        r.context.line_kind === context.line_kind &&
        r.context.prev_kind === context.prev_kind &&
        r.context.next_kind === context.next_kind &&
        r.context.lhs_kind === context.lhs_kind &&
        r.context.rhs_kind === context.rhs_kind &&
        r.context.lhs_facet === context.lhs_facet &&
        r.context.rhs_facet === context.rhs_facet,
    );
    if (facetTyped) return facetTyped;
  }
  // Tier 1: fully-typed relation (both sides are vars of named kinds). Skip
  // recipes that additionally declare facets — those belong to Tier 0 and must
  // not match a pair whose facets differ (or are absent).
  if (context.prev_kind && context.next_kind && context.lhs_kind && context.rhs_kind) {
    const typed = pick(
      (r) =>
        r.context.line_kind === context.line_kind &&
        r.context.prev_kind === context.prev_kind &&
        r.context.next_kind === context.next_kind &&
        r.context.lhs_kind === context.lhs_kind &&
        r.context.rhs_kind === context.rhs_kind &&
        !r.context.lhs_facet &&
        !r.context.rhs_facet,
    );
    if (typed) return typed;
  }
  // Tier 2: prev/next exact, ignoring var kinds — but skip recipes that
  // declare lhs/rhs (a typed recipe must not be chosen for a non-matching
  // pair of vars).
  if (context.prev_kind && context.next_kind) {
    const exact = pick(
      (r) =>
        r.context.line_kind === context.line_kind &&
        r.context.prev_kind === context.prev_kind &&
        r.context.next_kind === context.next_kind &&
        !r.context.lhs_kind &&
        !r.context.rhs_kind,
    );
    if (exact) return exact;
  }
  // Tier 3: line_kind alone.
  return pick(
    (r) =>
      r.context.line_kind === context.line_kind &&
      !r.context.prev_kind &&
      !r.context.next_kind,
  );
}

/**
 * Find a specific operator entry within a recipe, matching by base char.
 * Falls back to first-char match if exact raw match fails.
 */
export function matchOperator(
  recipe: RelationRecipe | null,
  rawOp: string,
): RelationRecipeOperator | null {
  if (!recipe || !rawOp) return null;
  const exact = recipe.operators.find((o) => o.op === rawOp);
  if (exact) return exact;
  // Fall back to first-char match (e.g. raw "===>" matches an entry with op ">")
  const lastChar = rawOp[rawOp.length - 1];
  const firstChar = rawOp[0];
  return (
    recipe.operators.find((o) => o.op === lastChar) ??
    recipe.operators.find((o) => o.op === firstChar) ??
    null
  );
}
