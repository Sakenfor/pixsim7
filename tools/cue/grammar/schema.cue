package grammar

// ── primitive types ─────────────────────────────────────────────────────────

#TokenKind: "IDENT" | "NUMBER" | "RUN" | "COLON" | "LPAREN" | "RPAREN" | "PLUS" | "STMT_SEP" | "WS" | "NEWLINE" | "TEXT"

// Characters that produce RUN tokens (consecutive runs of the same char).
// Semantic interpretation is left entirely to the recipe layer.
#RunChar: "=" | "<" | ">" | "_"

#LineNodeKind: "header" | "chain" | "prose"

// Line-terminal section header shapes only. Other patterns
// (`assignment` / `assignment_arrow` / `assignment_arrow_left` /
// `compound_assignment`) collapsed into the chain parser; legacy
// pattern_ids no longer appear in tokenizer output.
#PatternId: "colon" | "angle_bracket" | "freestanding"

// How a header pattern terminates its label with an operator.
#OpStyle:
    "colon"     |   // label followed by ':'
    "run_angle" |   // wrapped: RUN('>',1) label RUN('<',1)
    "none"          // no operator — label is the whole line (freestanding)

// Operator chars recognised by the chain parser (mid-line).
#ChainOpChar: "=" | "<" | ">" | ":"

// ── header pattern definition ───────────────────────────────────────────────

#HeaderPatternDef: {
    id:              #PatternId
    op_style:        #OpStyle

    // Label character constraints.
    label_upper_only: bool   // true  → all-uppercase IDENT (A-Z0-9_) only
                             // false → mixed-case, spaces, -/& allowed (colon)
    label_min: int & >=1
    label_max: int & >=label_min

    // Structural constraints.
    terminal:     bool  // true  → header must occupy the whole line (no trailing body)
    ws_before_op: bool  // true  → whitespace required between label and operator
    angle_wrap:   bool  // true  → operator wraps label: >LABEL<
}

// ── chain definition ────────────────────────────────────────────────────────
// The chain parser walks a line as a sequence of (var | prose) elements
// separated by operator runs. Cardinality (run length) is preserved;
// semantic meaning is a recipe-layer concern.

#ChainDef: {
    // RUN/COLON chars that act as chain operators.
    op_chars: [...#ChainOpChar]

    // RUN chars explicitly excluded from operator sequences.
    // '_' stays as part of IDENT when adjacent to letters.
    op_excludes: [...#RunChar]
}

// ── operator vocabulary ─────────────────────────────────────────────────────
// Surfaced to the editor's click-to-edit popover via /meta/operator-vocabulary.
// Backend stays authoritative on what's swap-eligible and the run-length cap.

#OperatorVocabularyDef: {
    swap_targets:   [...string]  // suggested operator chars the user can swap to
    max_run_length: int & >=1    // cap on consecutive op chars in a run
}

// ── top-level grammar rules schema ─────────────────────────────────────────

#GrammarRules: {
    // Bump when structural changes break existing consumers.
    version: string

    token_kinds:         [...#TokenKind]
    run_chars:           [...#RunChar]
    header_patterns:     [...#HeaderPatternDef]
    chain:               #ChainDef
    operator_vocabulary: #OperatorVocabularyDef
}
