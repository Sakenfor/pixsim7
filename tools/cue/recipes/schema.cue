package recipes

// Relation/operator recipes — semantic enrichment for prompt operators.
//
// Recipes describe what the system *knows about* — they're suggestions
// surfaced in the editor's click-to-edit popover, not validation rules.
// The grammar layer (tools/cue/grammar/) stays maximally permissive: any
// operator combination is parsed and rendered. Recipes only add labels
// and recommended swaps for known patterns.
//
// Notes are first-class: as the user tests prompts against models like
// pixverse i2v v6, findings can be captured per-operator or per-recipe.
// Future UI may let users author/edit recipes directly through the
// composer popover.

// ── notes (free-form findings) ──────────────────────────────────────────

#RecipeNote: {
    text:    string         // the actual finding / observation
    model?:  string         // target model id, e.g. "pixverse-i2v-v6"
    author?: string         // optional attribution
    date?:   string         // ISO date or freeform
    tags?:   [...string]    // freeform classification tags
}

// ── operator entries within a recipe ────────────────────────────────────

#OperatorEntry: {
    op:             string                   // base operator char(s), e.g. "<", ">", "=", "<>"
    meaning?:       string                   // human description of what this op signals
    run_semantics?: {[string]: string}       // run length (string key) → semantic label
    swap_targets:   [...string]              // recommended swaps in this context
    notes?:         [...#RecipeNote]
}

// ── context — when this recipe applies ──────────────────────────────────

#RelationContext: {
    line_kind?:  "header" | "relation"   // which kind of line
    pattern?:    string                  // header pattern id (assignment, compound_assignment, etc.)
    lhs_kind?:   string                  // freeform kind tag (ACTOR, SCENE, ANY, ...)
    rhs_kind?:   string
}

// ── recipe ──────────────────────────────────────────────────────────────

#RelationRecipe: {
    id:        string                 // unique kebab-id
    label?:    string                 // human-readable name
    context:   #RelationContext
    operators: [...#OperatorEntry]
    notes?:    [...#RecipeNote]       // recipe-level notes (apply to whole recipe)
}

// ── top-level shape ─────────────────────────────────────────────────────

#RelationRecipes: {
    version: string
    recipes: [...#RelationRecipe]
}
