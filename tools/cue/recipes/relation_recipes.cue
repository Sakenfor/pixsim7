package recipes

// Seed recipes for the chain model. Each recipe targets a specific
// (line_kind, prev_kind, next_kind) shape; matchRecipe picks the
// most specific fit before falling back to less constrained recipes.
// The grammar still accepts any operator combination — recipes only
// label recognised shapes and seed the type-swap UI.

relation_recipes: #RelationRecipes & {
    version: "2.0.0"

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
                    swap_targets: ["=", ":", ">", "<"]
                },
                {
                    op:           ">"
                    meaning:      "directional / scoped assignment"
                    swap_targets: [">", "<", "=", ":"]
                },
                {
                    op:           "<"
                    meaning:      "reverse-directional / scoped assignment"
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
                    op:      ">"
                    meaning: "directed action toward"
                    run_semantics: {
                        "1": "default"
                        "3": "intense"
                        "5": "very strong / abrupt"
                        "7": "extreme / forceful"
                    }
                    swap_targets: [">", "<", "=", "?"]
                },
                {
                    op:      "<"
                    meaning: "receives from / influenced by"
                    run_semantics: {
                        "1": "default"
                        "2": "stronger receive"
                        "3": "deep influence"
                    }
                    swap_targets: ["<", ">", "=", "?"]
                },
                {
                    op:      "="
                    meaning: "identification / role binding"
                    run_semantics: {
                        "1": "binding"
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
