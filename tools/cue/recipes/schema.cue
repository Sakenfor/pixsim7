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
//
// `line_kind` aligns with tokenizer line node kinds. Headers carry their
// pattern_id directly as the line_kind value (collapsing the old
// `line_kind: "header", pattern: "..."` two-level shape). For chains,
// the relevant axis is the kind of element on either side of the
// operator click.

#ChainElementKind: "var" | "prose"

#RecipeContext: {
    line_kind?:  "chain" | "colon" | "angle_bracket" | "freestanding"
    // Element kinds immediately surrounding the clicked operator.
    // Only meaningful for `line_kind: "chain"`.
    prev_kind?:  #ChainElementKind
    next_kind?:  #ChainElementKind
    // Freeform semantic-kind tags ("ACTOR", "SCENE", etc.) — the var's
    // name family with any trailing index stripped (ACTOR1 → ACTOR). A
    // recipe that declares these matches only when both operands are vars
    // of the named kinds (most-specific tier in matchRecipe / find_recipe).
    lhs_kind?:   string
    rhs_kind?:   string
}

// ── recipe ──────────────────────────────────────────────────────────────

#RelationRecipe: {
    id:        string                 // unique kebab-id
    label?:    string                 // human-readable name
    context:   #RecipeContext
    operators: [...#OperatorEntry]
    notes?:    [...#RecipeNote]       // recipe-level notes (apply to whole recipe)
}

// ── top-level shape ─────────────────────────────────────────────────────

#RelationRecipes: {
    version: string
    recipes: [...#RelationRecipe]
}
