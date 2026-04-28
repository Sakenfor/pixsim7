# Prompt DSL Chain Unification

Last updated: 2026-04-28
Owner: prompts / editor lane
Status: proposed
Stage: design

## Goal

Replace the current header-vs-relation parser dichotomy in the prompt
tokenizer with a single **chain model**: every line is a sequence of
elements (`var` or `prose`) separated by operators (`<`, `>`, `=`, `:`).
Visual treatment (header vs relation styling) becomes a downstream
rendering decision based on chain composition, not a parser decision.

This eliminates a class of edge cases the user keeps hitting as the DSL
grows (each new shape currently needs a new pattern in
`grammar_rules.json`), and it removes the long-standing bug where the
relation parser silently drops mid-line prose.

## Scope

In scope:

- Backend tokenizer rewrite of relation/assignment family into a unified
  chain parser.
- New `ChainLine` AST node + serialization with an `elements` array and
  an `operators` array, both carrying absolute char ranges.
- Drop the following header patterns (they collapse into chain rendering):
  `assignment`, `assignment_arrow`, `assignment_arrow_left`,
  `compound_assignment`. Keep `colon`, `angle_bracket`, `freestanding`
  (genuinely different line shapes).
- Frontend types (`PromptTokenLine` shape) + side panel + CM editor
  decorations updated to render based on chain elements.
- Recipe layer migration: recipes match on `(line_kind, operator,
  surrounding_element_kinds)` instead of header `pattern_id`.

Out of scope:

- Changes to the lexer (token kinds stay).
- The colon / angle_bracket / freestanding header patterns.
- New language features (autocomplete, lint, full Lezer grammar) —
  those remain on the codemirror plan.

## Current Baseline

Relevant files (post chain refactor — these are the lines of code that
will be touched):

- Backend
  - `pixsim7/backend/main/services/prompt/parser/tokenizer.py` —
    `_parse_line()` currently has 5 header pattern blocks + a
    `_try_relation()` fallback. These collapse into one
    `_try_chain()` that walks `IDENT|prose` between operators.
  - `pixsim7/backend/main/services/prompt/parser/grammar_rules.json` +
    `tools/cue/grammar/core_grammar.cue` — drop the 4 collapsing
    patterns, keep the rest.
  - `pixsim7/backend/main/services/prompt/parser/relation_recipes.json`
    + `tools/cue/recipes/relation_recipes.cue` — recipes keyed on
    pattern_id need new context schema.
  - `pixsim7/backend/main/api/v1/prompts/operations.py` — Pydantic
    `PromptTokenHeaderLine` / `PromptTokenRelationLine` replaced with
    a single `PromptTokenChainLine`.
  - `pixsim7/backend/main/api/v1/prompts/meta.py` — relation-recipes
    response schema updates to match the new context shape.

- Frontend
  - `apps/main/src/features/prompts/hooks/useShadowAnalysis.ts` —
    `PromptTokenLine` interface gains `elements` + `operators`.
  - `apps/main/src/features/prompts/components/ShadowSidePanel.tsx` —
    `StructureLine` rendering switches to chain elements.
  - `apps/main/src/features/prompts/lib/shadowAnalysisExtension.ts` —
    `buildHeaderDecorations` becomes `buildChainDecorations`; pattern
    badges become element-kind badges.
  - `apps/main/src/features/prompts/lib/operatorEditExtension.ts` —
    `collectOperatorRanges` reads `chain.operators[]` instead of
    `header.op_start` + `relation.hops[].op_*`.
  - `apps/main/src/features/prompts/hooks/useRelationRecipes.ts` —
    `matchRecipe` matches on chain context, not pattern_id.
  - `apps/main/src/features/prompts/components/OperatorEditPopover.tsx`
    — minor: receive richer context (prev/next element kind).

## Decisions Already Settled

- **Element types** are exactly two: `var` (UPPERCASE_IDENT, single
  token) and `prose` (anything else, greedy until next operator).
- **Operator chars** stay `<` `>` `=` `:` (and runs thereof).
- **Visual rendering** is chain-composition driven. All-var chain →
  amber/relation styling; any prose element → blue/header styling.
  May later drop the bar distinction entirely if inline element
  styling carries enough signal.
- **Special line shapes** that stay as separate patterns: `colon`,
  `angle_bracket`, `freestanding`. They are line-terminal shapes, not
  chains.
- **Permissive parsing** is preserved: any operator combination still
  parses; recipes are suggestions, not validation rules.
- **Recipes** keep their current "permissive" framing (recommended vs
  universal swap targets, notes for findings).

## Delivery Phases

### Phase 0: Tokenizer + AST

- [ ] Add `ChainLine` dataclass with `elements: List[ChainElement]`
      and `operators: List[ChainOperator]`. Each element carries
      `kind: 'var'|'prose'`, `text`, `start`, `end`. Each operator
      carries `op` (base char), `run`, `op_start`, `op_end`.
- [ ] Implement `_try_chain()` that walks tokens emitting
      element/operator pairs. Element boundaries: ws+non-IDENT-non-RUN
      ends prose; UPPER_IDENT alone is a var.
- [ ] Replace the 4 collapsing pattern checks in `_parse_line()` with
      a single `_try_chain()` call that runs *after* the colon /
      angle_bracket / freestanding checks.
- [ ] Update `_node_to_dict()` to serialize ChainLine.
- [ ] Update `grammar_rules.json` + `core_grammar.cue` —
      remove `assignment`, `assignment_arrow`, `assignment_arrow_left`,
      `compound_assignment`.

Exit criteria:

- All sample lines from the user's i2v prompt parse into ChainLine with
  the expected elements/operators (smoke-test script in PR).
- `pytest pixsim7/backend/tests/test_prompt_parser_authority.py` and
  the section parser tests pass after updates.

### Phase 1: API + Frontend types

- [ ] Replace `PromptTokenHeaderLine` and `PromptTokenRelationLine` in
      `operations.py` with a single `PromptTokenChainLine` Pydantic
      model. Keep `PromptTokenProseLine` (and `colon` / `angle_bracket`
      header lines stay as separate models).
- [ ] Mirror in `useShadowAnalysis.ts` types.
- [ ] Endpoint smoke-test: `GET /prompts/analyze` returns chain lines
      with all element/operator ranges populated.

Exit criteria:

- `npx tsc --noEmit --project apps/main/tsconfig.json` clean.

### Phase 2: Frontend rendering

- [ ] `ShadowSidePanel.StructureLine` renders chain elements inline,
      with per-element styling (var: mono/colored, prose: italic).
      Operator runs render with the existing pattern badge map.
- [ ] `shadowAnalysisExtension.ts` updates:
  - `buildHeaderDecorations` → `buildChainDecorations`. One
    `Decoration.line` class per chain (`cm-chain-line`); inline
    `Decoration.mark` per element with `data-elem-kind="var"` or
    `"prose"`. Operators keep their existing decoration for
    click-to-edit.
  - Visual rule: chain lines containing any prose element get
    `cm-chain-line-with-body`; all-var chain lines get
    `cm-chain-line-pure`. Theme assigns blue / amber tints
    accordingly.
- [ ] `operatorEditExtension.ts` reads operator ranges from
      `chain.operators[]` rather than the per-pattern fields.

Exit criteria:

- Editor renders user's full sample prompt with the same visual
  feedback they had before, plus prose bodies (Latin descriptions)
  no longer dropped from chains like
  `ACTOR1_TOOLS_TONGUE < Lingua ūmida...`.

### Phase 3: Recipes + popover

- [ ] Update recipe context schema (CUE + JSON):
  - `line_kind` becomes `'chain' | 'colon' | 'angle_bracket' | 'freestanding'`
  - new fields: `prev_kind?: 'var'|'prose'`, `next_kind?: 'var'|'prose'`
  - existing recipes (`simple_assignment`, `compound_assignment`,
    `arrow_assignment`, `arrow_assignment_left`, `relation_general`)
    rewritten as chain recipes keyed on operator + neighbour kinds.
- [ ] `useRelationRecipes.matchRecipe()` matches on chain context.
- [ ] `OperatorEditPopover` receives `(prevElement, nextElement)` from
      the operator click handler. Recipe match uses these.

Exit criteria:

- Operator popover shows correct recommended swaps for each example
  in the user's prompt. Notes section still surfaces seed pixverse
  i2v v6 finding.

### Phase 4: Cleanup + ship

- [ ] Delete dead code from the dropped patterns (header pattern
      handlers, related Pydantic models, related frontend types).
- [ ] Update memory notes / docs that referenced the old patterns.
- [ ] Rerun full test suite: backend tokenizer tests, frontend type
      check, manual smoke test on the user's i2v prompt.
- [ ] Update this plan's status to `completed` and move to
      `docs/plans/done/`.

Exit criteria:

- No references to `compound_assignment` / `assignment_arrow_left` /
  `assignment_arrow` / `assignment` patterns remain in the codebase.
- One round-trip parse-render cycle on the user's prompt shows all
  classifications matching the chain model expectations.

## Risks

- Risk: Re-classifying lines that were previously headers as something
  else may surprise downstream consumers (analyzers, the side panel
  pre-existing rendering code).
  - Mitigation: feature-gate behind a debug flag for one cycle; keep
    the old patterns returning `(kind='header', pattern='legacy_*')`
    while the new chain output ships in parallel; switch consumers
    one at a time.

- Risk: The seed recipes won't translate cleanly to the new context
  shape (`prev_kind`/`next_kind`).
  - Mitigation: write the new recipes from scratch using the user's
    actual prompt as a fixture; throw away the legacy recipes — they
    were exploratory anyway.

- Risk: Visual rendering rules for "all-var vs has-prose" may not
  match user expectations on edge cases.
  - Mitigation: ship the simplest rule first (any prose → header
    styling), iterate after the user tests on real prompts.

## Update Log

- 2026-04-28 (committed in same change): Plan drafted from session
  discussion of unified chain model. Predecessor work (CM editor +
  operator-edit popover + permissive recipe layer) committed in the
  same change so this plan starts from a clean baseline.
