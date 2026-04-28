package recipes

// Sample relation recipes — exploratory, based on user's testing of
// pixverse i2v v6. Notes can be added/edited as findings accumulate.
// The grammar still accepts any operator combination; these are
// suggestions only.

relation_recipes: #RelationRecipes & {
    version: "1.0.0"

    recipes: [
        // ── ACTOR = WEREWOLF style assignments ─────────────────────────
        {
            id:    "simple_assignment"
            label: "Simple assignment"
            context: {
                line_kind: "header"
                pattern:   "assignment"
            }
            operators: [
                {
                    op:           "="
                    meaning:      "definition / identity assignment"
                    swap_targets: ["=", ":"]
                },
            ]
        },

        // ── ACTOR2<REPOSE<STANDING... = body ──────────────────────────
        {
            id:    "compound_assignment"
            label: "Compound key assignment"
            context: {
                line_kind: "header"
                pattern:   "compound_assignment"
            }
            operators: [
                {
                    op:           "="
                    meaning:      "compound-key body definition"
                    swap_targets: ["=", ":"]
                },
            ]
        },

        // ── LOCATION > BODY style headers ─────────────────────────────
        {
            id:    "arrow_assignment"
            label: "Arrow assignment"
            context: {
                line_kind: "header"
                pattern:   "assignment_arrow"
            }
            operators: [
                {
                    op:           ">"
                    meaning:      "directional / scoped assignment"
                    swap_targets: [">", "<", "="]
                },
            ]
        },

        // ── ACTOR1_TOOLS_TONGUE < BODY style headers ────────────────
        {
            id:    "arrow_assignment_left"
            label: "Arrow assignment (left)"
            context: {
                line_kind: "header"
                pattern:   "assignment_arrow_left"
            }
            operators: [
                {
                    op:           "<"
                    meaning:      "reverse-directional / scoped assignment"
                    swap_targets: ["<", ">", "="]
                },
            ]
        },

        // ── general ACTOR ↔ ACTOR relations ───────────────────────────
        // Catch-all for relation lines until kinds are wired up.
        {
            id:    "relation_general"
            label: "Relation chain"
            context: {
                line_kind: "relation"
            }
            operators: [
                {
                    op:           ">"
                    meaning:      "directed action toward"
                    run_semantics: {
                        "1": "default"
                        "3": "intense"
                        "5": "very strong / abrupt"
                        "7": "extreme / forceful"
                    }
                    swap_targets: [">", "<", "=", "?"]
                },
                {
                    op:           "<"
                    meaning:      "receives from / influenced by"
                    run_semantics: {
                        "1": "default"
                        "2": "stronger receive"
                        "3": "deep influence"
                    }
                    swap_targets: ["<", ">", "=", "?"]
                },
                {
                    op:           "="
                    meaning:      "identification / role binding"
                    run_semantics: {
                        "1": "binding"
                        "5": "emphatic binding"
                    }
                    swap_targets: ["=", ">", "<"]
                },
            ]
            notes: [
                {
                    text:  "Initial recipe seeded for pixverse i2v v6 exploration. Run-length semantics are placeholder hypotheses — refine with testing."
                    model: "pixverse-i2v-v6"
                    date:  "2026-04-27"
                    tags: ["seed", "i2v"]
                },
            ]
        },
    ]
}
