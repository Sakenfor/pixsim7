package grammar

// ── primitive types ─────────────────────────────────────────────────────────

#TokenKind: "IDENT" | "NUMBER" | "RUN" | "COLON" | "LPAREN" | "RPAREN" | "PLUS" | "STMT_SEP" | "WS" | "NEWLINE" | "TEXT"

// Characters that produce RUN tokens (consecutive runs of the same char).
// Semantic interpretation is left entirely to the recipe layer.
#RunChar: "=" | "<" | ">" | "_"

#LineNodeKind: "header" | "relation" | "prose"

// Mirrors PatternId in sections.ts / SimplePromptParser.BUILTIN_SECTION_PATTERNS.
#PatternId: "colon" | "assignment" | "assignment_arrow" | "assignment_arrow_left" | "angle_bracket" | "freestanding" | "compound_assignment"

// How a header pattern terminates its label with an operator.
#OpStyle:
    "colon"     |   // label followed by ':'
    "run_eq"    |   // label followed by RUN('=', n>=1)
    "run_gt"    |   // label followed by RUN('>', n>=1)  [ws_before_op required]
    "run_lt"    |   // label followed by RUN('<', n>=1)  [ws_before_op required]
    "run_angle" |   // wrapped: RUN('>',1) label RUN('<',1)
    "none"      |   // no operator — label is the whole line (freestanding)
    "compound"      // chain of IDENTs joined by <> ops, terminated by '='

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

// ── relation definition ─────────────────────────────────────────────────────

#RelationDef: {
    // RUN chars that act as relation operators.
    // Cardinality (run length) is preserved; semantic meaning is recipe-layer concern.
    op_chars: [...#RunChar]

    // RUN chars explicitly excluded from operator sequences.
    // '_' stays as part of IDENT when adjacent to letters, so it is excluded here.
    op_excludes: [...#RunChar]

    lhs_optional:     bool  // left-hand IDENT may be absent
    rhs_optional:     bool  // right-hand IDENT may be absent
    allow_standalone: bool  // bare operator (no lhs AND no rhs) is a valid relation node
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
    relation:            #RelationDef
    operator_vocabulary: #OperatorVocabularyDef
}
