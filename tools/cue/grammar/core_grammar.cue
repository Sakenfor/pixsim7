package grammar

// Core grammar rules for the PixSim7 prompt tokenizer.
//
// These definitions drive both the Python tokenizer
// (parser/tokenizer.py) and the TypeScript grammar (grammar.ts) via
// generated grammar_rules.json.  Neither runtime hard-codes these
// values — they load the JSON at startup.
//
// Semantic interpretation of RUN token cardinality (e.g. what >>>>>>>
// means vs. >) belongs to the recipe layer, not here.

grammar_rules: #GrammarRules & {
    version: "1.0.0"

    token_kinds: [
        "IDENT",    // [A-Za-z][A-Za-z0-9_]*  (underscore stays in IDENT when adjacent to letters)
        "NUMBER",   // [0-9]+
        "RUN",      // consecutive run of one run_char
        "COLON",    // :
        "LPAREN",   // (
        "RPAREN",   // )
        "PLUS",     // +
        "WS",       // [ \t]+
        "NEWLINE",  // \n | \r\n | \r
        "TEXT",     // any other single character (fallback — lexer never fails)
    ]

    // Characters that produce RUN tokens when they appear consecutively.
    // Order is irrelevant; each char forms its own run independently.
    run_chars: ["=", "<", ">", "_"]

    // ── section header patterns ─────────────────────────────────────────
    // Ordered from most- to least-specific for documentation clarity;
    // the parser tries all active patterns per line independently.

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
            id:               "assignment"
            op_style:         "run_eq"
            label_upper_only: true    // ACTOR1, SCENE_TWO — uppercase+digits+underscore
            label_min:        2
            label_max:        59
            terminal:         false   // body follows on same line
            ws_before_op:     false   // "LABEL=body" and "LABEL = body" both valid
            angle_wrap:       false
        },
        {
            id:               "assignment_arrow"
            op_style:         "run_gt"
            label_upper_only: true
            label_min:        2
            label_max:        59
            terminal:         false
            ws_before_op:     true    // mandatory WS prevents "ACTOR1>ACTOR2" from matching
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

    // ── relation pattern ────────────────────────────────────────────────
    // Structural definition only.  Cardinality semantics (what run=7
    // means for >) are recipe-layer concerns confirmed through testing.

    relation: {
        op_chars:         ["=", "<", ">"]
        op_excludes:      ["_"]     // _ stays inside IDENT runs; not a relation op
        lhs_optional:     true      // "=====>  ACTOR" (no lhs) is valid
        rhs_optional:     true      // "ACTOR1>>>>>>>" (no rhs) is valid
        allow_standalone: true      // bare "=====>" with no operands is a valid relation node
    }
}
