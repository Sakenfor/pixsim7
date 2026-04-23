/**
 * Prompt recipe registry.
 *
 * A recipe selects which section-detection patterns and (future) grammar
 * rules are active for a given generation context. Recipes are matched by
 * `operation_type` and/or `model_id`; the first match wins. The
 * `'default'` recipe is always the fallback.
 */
import { DEFAULT_ACTIVE_PATTERNS, type PatternId } from './sections';

export interface RecipeContext {
  operation_type?: string;
  model_id?: string;
  provider_id?: string;
}

export interface Recipe {
  id: string;
  /** Human-readable label (for debug / UI display). */
  label: string;
  /**
   * Matching criteria. All present keys must match; missing keys are
   * wildcards. An empty object matches everything (used by `'default'`).
   */
  matches: Partial<RecipeContext>;
  activePatterns: PatternId[];
}

const BUILT_IN_RECIPES: Recipe[] = [
  {
    id: 'i2v',
    label: 'Image to Video',
    matches: { operation_type: 'image_to_video' },
    // Same patterns as default for now. Relations (`>>>`, `<<<<`, `====>`)
    // are parsed structurally by the grammar regardless of recipe; the
    // recipe layer will grow to interpret RUN cardinality once i2v DSL
    // semantics are confirmed.
    activePatterns: DEFAULT_ACTIVE_PATTERNS,
  },
  {
    id: 'default',
    label: 'Default',
    matches: {},
    activePatterns: DEFAULT_ACTIVE_PATTERNS,
  },
];

/**
 * Resolve a recipe from the registry for the given context.
 * Always returns a value (falls back to `'default'`).
 */
export function resolveRecipe(ctx: RecipeContext): Recipe {
  for (const recipe of BUILT_IN_RECIPES) {
    const { matches } = recipe;
    if (
      (matches.operation_type === undefined || matches.operation_type === ctx.operation_type) &&
      (matches.model_id       === undefined || matches.model_id       === ctx.model_id)       &&
      (matches.provider_id    === undefined || matches.provider_id    === ctx.provider_id)
    ) {
      return recipe;
    }
  }
  return BUILT_IN_RECIPES[BUILT_IN_RECIPES.length - 1]; // always default
}

export { BUILT_IN_RECIPES };
