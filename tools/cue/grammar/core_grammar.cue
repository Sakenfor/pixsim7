package grammar

// Core grammar rules for the PixSim7 prompt tokenizer.
//
// These definitions drive both the Python tokenizer
// (parser/tokenizer.py) and the TypeScript grammar (grammar.ts) via
// generated grammar_rules.json.  Neither runtime hard-codes these
// values — they load the JSON at startup.
//
// Semantic interpretation of operator runs (e.g. what >>>>>>> means
// vs. >) belongs to the recipe layer, not here.

grammar_rules: #GrammarRules & {
    version: "1.0.0"

    token_kinds: [
        "IDENT",     // [A-Za-z][A-Za-z0-9_]*  (underscore stays in IDENT when adjacent to letters)
        "NUMBER",    // [0-9]+
        "RUN",       // consecutive run of one run_char
        "COLON",     // :
        "LPAREN",    // (
        "RPAREN",    // )
        "PLUS",      // +
        "STMT_SEP",  // ;  logical line separator — splits one physical line into multiple parse units
        "WS",        // [ \t]+
        "NEWLINE",   // \n | \r\n | \r
        "TEXT",      // any other single character (fallback — lexer never fails)
    ]

    // Characters that produce RUN tokens when they appear consecutively.
    // Order is irrelevant; each char forms its own run independently.
    run_chars: ["=", "<", ">", "_"]

    // ── section header patterns ─────────────────────────────────────────
    // Only the three line-terminal shapes remain here. Lines like
    // `LABEL = body`, `LABEL > body`, `A<B<C = body`, and relation-style
    // `A ===> B` are now classified by the chain parser (see chain block
    // below), not as headers.

    header_patterns: [
        {
            id:               "colon"
            op_style:         "colon"
            label_upper_only: false   // "Scene Setting:", "B&W:" etc. allowed
            label_min:        2
            label_max:        39
            terminal:         true    // colon must end the line
            ws_before_op:     false
            angle_wrap:       false
        },
        {
            id:               "angle_bracket"
            op_style:         "run_angle"
            label_upper_only: true    // uppercase only, spaces allowed: >SCENE SETTING<
            label_min:        2
            label_max:        9999    // no practical upper limit
            terminal:         true    // >LABEL< must be the whole line
            ws_before_op:     false
            angle_wrap:       true
        },
        {
            id:               "freestanding"
            op_style:         "none"
            label_upper_only: true
            label_min:        3       // avoids short acronyms like "OK", "AI"
            label_max:        41
            terminal:         true    // label must be the whole line
            ws_before_op:     false
            angle_wrap:       false
        },
    ]

    // ── chain pattern ───────────────────────────────────────────────────
    // A chain is a sequence of elements (var | prose) separated by
    // operator runs. Element classification happens after WS-trim:
    // exactly one UPPER_IDENT → var; anything else → prose. Operator
    // runs collapse contiguous op-char tokens into one operator;
    // whitespace breaks an operator. Cardinality semantics belong to
    // the recipe layer.

    chain: {
        op_chars:    ["=", "<", ">", ":"]
        op_excludes: ["_"]   // _ stays inside IDENT runs; not a chain op
    }

    // ── operator vocabulary ─────────────────────────────────────────────
    // Surfaced via /api/v1/prompts/meta/operator-vocabulary; drives the
    // editor's click-to-edit popover. Permissive: the user can still type
    // any operator; this list only seeds the type-swap UI.

    operator_vocabulary: {
        swap_targets:   ["=", "<", ">", ":", "?"]
        max_run_length: 12
    }
}
