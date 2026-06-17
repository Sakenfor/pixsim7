package recipes

// Seed recipes for the chain model. Each recipe targets a specific
// (line_kind, prev_kind, next_kind) shape; matchRecipe picks the
// most specific fit before falling back to less constrained recipes.
// The grammar still accepts any operator combination — recipes only
// label recognised shapes and seed the type-swap UI.

relation_recipes: #RelationRecipes & {
    version: "2.5.0"

    recipes: [
        // ── var = body | var > body | var < body ──────────────────────
        // "Label-with-body" — a chain where a single var on the left is
        // followed by a prose element on the right. Covers what used to
        // be `assignment`, `assignment_arrow`, `assignment_arrow_left`,
        // and `compound_assignment` (the `=` at the end of a chained-var
        // LHS reduces to this same shape: the prev element of the final
        // `=` is a var, the next is prose).
        //
        // The `<` arm is the latin-enhancer hook — `ACTOR1_TOOLS_TONGUE
        // < Lingua ūmida flōrem...` matches here; future latin-pack
        // suggestions will key off this recipe + prev var's tag_key.
        {
            id:    "chain_var_to_prose"
            label: "Label with body"
            context: {
                line_kind: "chain"
                prev_kind: "var"
                next_kind: "prose"
            }
            operators: [
                {
                    op:           "="
                    meaning:      "definition / identity assignment"
                    template:     "{lhs}: {rhs}"
                    swap_targets: ["=", ":", ">", "<"]
                },
                {
                    op:           ":"
                    meaning:      "labelled body (inline colon)"
                    template:     "{lhs}: {rhs}"
                    swap_targets: [":", "=", ">", "<"]
                },
                {
                    op:           ">"
                    meaning:      "directional / scoped assignment"
                    template:     "{lhs} toward {rhs}"
                    swap_targets: [">", "<", "=", ":"]
                },
                {
                    op:           "<"
                    meaning:      "reverse-directional / scoped assignment"
                    template:     "{lhs} from {rhs}"
                    swap_targets: ["<", ">", "=", ":"]
                },
            ]
        },

        // ── body = var | body > var | body < var ──────────────────────
        // Symmetric sibling of `chain_var_to_prose`: a chain where a prose /
        // value element on the left is followed by a var on the right. Covers
        // the tail of mixed chains like `… = (Sonus duplex est. …) < DELIBERATE`
        // where a paren-wrapped value body relates onward to a var. Without
        // this, prose→var operators resolve to no meaning.
        {
            id:    "chain_prose_to_var"
            label: "Body to label"
            context: {
                line_kind: "chain"
                prev_kind: "prose"
                next_kind: "var"
            }
            operators: [
                {
                    op:           "="
                    meaning:      "body bound to / identified as the var"
                    template:     "{lhs} as {rhs}"
                    swap_targets: ["=", ":", ">", "<"]
                },
                {
                    op:           ">"
                    meaning:      "body directed toward the var"
                    template:     "{lhs} toward {rhs}"
                    swap_targets: [">", "<", "=", ":"]
                },
                {
                    op:           "<"
                    meaning:      "body shaped by / receives from the var"
                    template:     "{lhs} shaped by {rhs}"
                    swap_targets: ["<", ">", "=", ":"]
                },
            ]
        },

        // ── var <op> var (relation between vars) ──────────────────────
        // The all-var chain — `ACTOR1 ===> SCENE <=== ACTOR2`,
        // `A<B<C` etc. Run-length semantics are exploratory; refine
        // with i2v testing.
        {
            id:    "chain_var_to_var"
            label: "Relation chain"
            context: {
                line_kind: "chain"
                prev_kind: "var"
                next_kind: "var"
            }
            operators: [
                {
                    op:       ">"
                    meaning:  "directed action toward"
                    template: "{lhs} acting on {rhs}"
                    run_semantics: {
                        "1": "default"
                        "2": "firm"
                        "3": "intense"
                        "4": "strong"
                        "5": "very strong / abrupt"
                        "6": "severe"
                        "7": "extreme / forceful"
                    }
                    swap_targets: [">", "<", "=", "?"]
                },
                {
                    op:       "<"
                    meaning:  "receives from / influenced by"
                    template: "{lhs} influenced by {rhs}"
                    run_semantics: {
                        "1": "default"
                        "2": "stronger receive"
                        "3": "deep influence"
                    }
                    swap_targets: ["<", ">", "=", "?"]
                },
                {
                    op:       "="
                    meaning:  "identification / role binding"
                    template: "{lhs} as {rhs}"
                    run_semantics: {
                        "1": "binding"
                        "2": "firm binding"
                        "3": "strong binding"
                        "4": "tight binding"
                        "5": "emphatic binding"
                    }
                    swap_targets: ["=", ">", "<"]
                },
            ]
            notes: [
                {
                    text:  "Run-length semantics seeded for pixverse i2v v6 exploration. Refine with testing."
                    model: "pixverse-i2v-v6"
                    date:  "2026-04-27"
                    tags: ["seed", "i2v"]
                },
            ]
        },

        // ── var <op> var — i2v motion-tuned overlay ───────────────────
        // Same structural shape as `chain_var_to_var`, but scoped to the
        // image_to_video operation: run-length reads as *motion intensity*
        // rather than the generic "directed action". For any non-i2v model
        // this recipe is ineligible and matching falls back to the unscoped
        // `chain_var_to_var`. Demonstrates context.operation_types scoping —
        // add `models: [...]` the same way to gate on a specific model id.
        {
            id:    "chain_var_to_var_i2v"
            label: "Relation chain (i2v motion)"
            context: {
                line_kind:       "chain"
                prev_kind:       "var"
                next_kind:       "var"
                operation_types: ["image_to_video"]
            }
            operators: [
                {
                    op:      ">"
                    meaning: "drives motion toward (run length = motion intensity)"
                    run_semantics: {
                        "1": "drifts toward"
                        "2": "moves toward"
                        "3": "pushes toward"
                        "4": "drives toward"
                        "5": "surges toward"
                        "6": "charges toward"
                        "7": "slams toward"
                    }
                    swap_targets: [">", "<", "=", "?"]
                },
                {
                    op:      "<"
                    meaning: "is driven back by (run length = motion intensity)"
                    run_semantics: {
                        "1": "eases back"
                        "2": "gives ground"
                        "3": "recoils"
                        "4": "reels back"
                        "5": "is flung back"
                    }
                    swap_targets: ["<", ">", "=", "?"]
                },
            ]
            notes: [
                {
                    text:  "i2v-scoped run_semantics overlay — motion-intensity framing. Falls back to chain_var_to_var for non-i2v ops."
                    model: "pixverse-i2v-v6"
                    date:  "2026-06-02"
                    tags: ["seed", "i2v", "model-scoped"]
                },
            ]
        },

        // ── ACTOR <op> ACTOR (typed character relation) ───────────────
        // A var→var chain where both sides normalize to the ACTOR kind
        // (`ACTOR1 ===> ACTOR2`). More specific than `chain_var_to_var`:
        // matched only when both operands are ACTOR-family vars, so a
        // character-to-character interaction carries social/physical
        // semantics rather than the generic "directed action toward".
        // Demonstrates the lhs_kind/rhs_kind typed-matching tier; clone
        // this shape for ACTOR→SCENE, SCENE→ACTOR, etc.
        {
            id:    "chain_actor_to_actor"
            label: "Character interaction"
            context: {
                line_kind: "chain"
                prev_kind: "var"
                next_kind: "var"
                lhs_kind:  "ACTOR"
                rhs_kind:  "ACTOR"
            }
            operators: [
                {
                    op:      ">"
                    meaning: "acts on / directs toward the other character"
                    run_semantics: {
                        "1": "engages"
                        "2": "presses"
                        "3": "assertive"
                        "4": "commanding"
                        "5": "forceful / dominant"
                        "6": "domineering"
                        "7": "overwhelming"
                    }
                    swap_targets: [">", "<", "=", "?"]
                },
                {
                    op:      "<"
                    meaning: "yields to / is acted on by the other character"
                    run_semantics: {
                        "1": "responds"
                        "2": "defers"
                        "3": "submits"
                        "4": "gives way"
                        "5": "fully yields"
                    }
                    swap_targets: ["<", ">", "=", "?"]
                },
                {
                    op:      "="
                    meaning: "mutual / paired with the other character"
                    run_semantics: {
                        "1": "paired"
                        "2": "close"
                        "3": "bonded"
                        "4": "intertwined"
                        "5": "deeply entwined"
                    }
                    swap_targets: ["=", ">", "<"]
                },
            ]
            notes: [
                {
                    text:  "Typed ACTOR↔ACTOR relation. Run-length semantics framed for character interaction intensity; refine with i2v testing."
                    model: "pixverse-i2v-v6"
                    date:  "2026-06-02"
                    tags: ["seed", "i2v", "typed-relation"]
                },
            ]
        },

        // ── colon section header ──────────────────────────────────────
        // `CAMERA:` and similar. The colon operator is clickable; swap
        // to `=` lets the user re-key the section as a chain assignment
        // (line becomes `CAMERA = body` after editing).
        {
            id:    "header_colon"
            label: "Section header"
            context: {
                line_kind: "colon"
            }
            operators: [
                {
                    op:           ":"
                    meaning:      "section label"
                    swap_targets: [":", "=", ">"]
                },
            ]
        },
    ]
}
