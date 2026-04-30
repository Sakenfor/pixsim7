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

export interface RelationRecipeContext {
  // 'relation' kept for back-compat with any persisted recipes; new recipes
  // should use 'chain'. Phase 3 will rewrite the recipe schema to use
  // (line_kind: 'chain', operator + prev_kind/next_kind) keys.
  line_kind?: 'header' | 'chain' | 'relation';
  pattern?: string;
  lhs_kind?: string;
  rhs_kind?: string;
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
 * Find the best-matching recipe for a given context. Resolution:
 *   1. Exact (line_kind, pattern) match
 *   2. line_kind match without pattern constraint
 *   3. null (caller falls back to grammar's universal swap_targets)
 */
export function matchRecipe(
  recipes: RelationRecipe[],
  context: { line_kind: 'header' | 'chain' | 'relation'; pattern?: string },
): RelationRecipe | null {
  if (context.pattern) {
    const exact = recipes.find(
      (r) => r.context.line_kind === context.line_kind && r.context.pattern === context.pattern,
    );
    if (exact) return exact;
  }
  return (
    recipes.find(
      (r) => r.context.line_kind === context.line_kind && !r.context.pattern,
    ) ?? null
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
