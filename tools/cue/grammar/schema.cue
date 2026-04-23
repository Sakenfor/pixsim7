package grammar

// ── primitive types ─────────────────────────────────────────────────────────

#TokenKind: "IDENT" | "NUMBER" | "RUN" | "COLON" | "LPAREN" | "RPAREN" | "PLUS" | "WS" | "NEWLINE" | "TEXT"

// Characters that produce RUN tokens (consecutive runs of the same char).
// Semantic interpretation is left entirely to the recipe layer.
#RunChar: "=" | "<" | ">" | "_"

#LineNodeKind: "header" | "relation" | "prose"

// Mirrors PatternId in sections.ts / SimplePromptParser.BUILTIN_SECTION_PATTERNS.
#PatternId: "colon" | "assignment" | "assignment_arrow" | "angle_bracket" | "freestanding"

// How a header pattern terminates its label with an operator.
#OpStyle:
    "colon"     |   // label followed by ':'
    "run_eq"    |   // label followed by RUN('=', n>=1)
    "run_gt"    |   // label followed by RUN('>', n>=1)  [ws_before_op required]
    "run_angle" |   // wrapped: RUN('>',1) label RUN('<',1)
    "none"          // no operator — label is the whole line (freestanding)

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

// ── top-level grammar rules schema ─────────────────────────────────────────

#GrammarRules: {
    // Bump when structural changes break existing consumers.
    version: string

    token_kinds:     [...#TokenKind]
    run_chars:       [...#RunChar]
    header_patterns: [...#HeaderPatternDef]
    relation:        #RelationDef
}
