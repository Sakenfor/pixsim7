# Test Overview

This repository uses a unified test runner at `scripts/tests/run.py` to route backend (`pytest`) and frontend (`vitest`) targets by profile.

## Why

- Keep test execution predictable across backend and frontend changes.
- Keep test selection small for day-to-day development.
- Keep folder ownership clear for service/domain/runtime paths.

## Main Folders

- `pixsim7/backend/tests/services/ownership/`
  - ownership/scope/list/write policy behavior
- `pixsim7/backend/tests/domain/game/`
  - project runtime metadata canonicalization and domain contracts
- `pixsim7/backend/tests/`
  - canonical backend suite root (api/services/domain/integration)
- `pixsim7/backend/tests/test_prompt_primitive_projection.py`
  - prompt parser shadow-mode primitive projection behavior
- `pixsim7/backend/tests/test_primitive_projection_edge_cases.py`
  - primitive projection false-positive resistance and edge-case regression coverage
- `pixsim7/backend/tests/test_block_fit_scoring_controlled_schema.py`
  - controlled-schema scoring behavior for prompt block fit ranking
  - context-aware op/signature scoring: exact op match, family match/mismatch, signature-only, modality alignment
  - backward-compatibility: legacy callers without parser_context still produce valid scores
- `scripts/seeds/game/bananza/tests/`
  - Bananza CLI/watch/sync/runtime preference behavior
- `scripts/tests/block_ops/primitive_projection/eval_primitive_projection.py`
  - block-ops primitive projection evaluator (supports baseline + medium corpus diagnostics)
- `apps/main/src/lib/game/projectBundle/__tests__/`
  - frontend project bundle runtime/lifecycle/migration behavior
- `pixsim7/backend/tests/api/test_codegen_admin_endpoints.py`
  - backend devtools/codegen API execution contract
- `apps/main/src/lib/game/projectBundle/__tests__/lifecycleRuntime.test.ts`
  - frontend lifecycle transition and idempotent import/reload behavior
- `apps/main/src/lib/game/projectBundle/__tests__/runtimeMeta.test.ts`
  - frontend runtime metadata canonicalization behavior

Manual smoke tests (skipped by default, opt-in via env vars):

- `tests/parser/test_parser.py` (`RUN_PROMPT_PARSER_SMOKE=1`)
- `tests/semantic/test_semantic_packs.py` (`RUN_SEMANTIC_PACK_SMOKE=1`)
- `tests/scripts/test_media_ingestion.py` (`RUN_MEDIA_INGESTION_SMOKE=1`)

## Runner Profiles

- `changed`
  - Maps changed files to related backend/frontend targets.
  - Uses suite `covers` metadata first, then falls back to legacy path heuristics for uncovered files.
  - Falls back to `fast` if no changed files are detected.
- `fast`
  - Focused suite for ownership, project bundle, runtime metadata, Bananza preferences, and frontend project bundle tests.
- `project-bundle`
  - `fast` plus Bananza project sync/registration coverage.
- `full`
  - Full backend tests (`backend/tests`) + Bananza tests + frontend `apps/main/src` tests.

## Commands

```bash
pnpm test                  # changed
pnpm test:list             # list resolved commands
pnpm test:list:json        # machine-readable profile/targets/catalog payload
pnpm test:fast             # focused local validation
pnpm test:project-bundle   # lifecycle/project-bundle focus
pnpm test:full             # broad run
pnpm test:backend          # changed profile backend only
pnpm test:frontend         # changed profile frontend only
pnpm test:registry:gen     # regenerate scripts/tests/test-registry.json from TS registry
pnpm test:registry:check   # validate suite metadata and covers paths
```

## Suite Registration

Test suites register themselves automatically — discovery walks the filesystem
and infers all required metadata from each file's path. `TEST_SUITE` blocks
are **optional overrides**, not required boilerplate.

Discovery code lives at the repo-level `testing/` package (`testing/discovery.py`
+ `testing/catalog.py`) — pure stdlib, no backend deps. The DB-sync side
(`pixsim7/backend/main/services/testing/sync.py`) imports from there.

### Backend / Scripts (Python)

**Minimum viable test file** — no `TEST_SUITE` block, no boilerplate:

```python
# pixsim7/backend/tests/client/test_agent_errors.py
"""Module docstring becomes the suite description."""

def test_something():
    ...
```

This auto-cataloges as:
- `id`: `client-agent-errors` (folder + stem, kebab-case)
- `label`: `Client Agent Errors Tests`
- `category`: `client` (first folder after `tests/`)
- `subcategory`: `agent-errors` (file stem)
- `kind`: `unit`
- `description`: the module docstring
- `path`, `layer`: derived from file location

Add `TEST_SUITE` only to **override** defaults:

```python
TEST_SUITE = {
    "kind": "contract",                              # default is "unit"
    "covers": ["pixsim7/backend/main/api/v1/x.py"],  # default is ()
}
```

Required fields (when present) are still validated: `id`, `label`, `path`,
`layer`, `kind`, `category`. Discovery always provides defaults, so absent
fields don't fail validation. `subcategory` and `covers` are optional.

For directory-level suites, put `TEST_SUITE` in `conftest.py` — the discovery
script uses the directory as the suite path.

Discovery: `scripts/tests/discover_backend_suites.py` scans `pixsim7/backend/tests/`
and `scripts/` via AST parsing (no imports executed).

### Frontend (TypeScript)

Frontend works the same way — `discover_frontend_suites` globs
`apps/**/*.test.{ts,tsx}` and `packages/**/*.test.{ts,tsx}`, inferring
metadata from path. Add `export const TEST_SUITE = {...}` only to override
inferred defaults. There's no required registration call.

### Metadata fields

- `category`: stable high-level area (`backend/api`, `frontend/project-bundle`, `scripts/bananza`) — inferred from first folder under the scan root
- `subcategory`: focused domain inside a category — inferred from deeper folder or file stem
- `kind`: `unit | contract | integration | e2e | smoke` — defaults to `unit`
- `covers`: source paths the suite validates — optional, enables plan-coverage auto-discovery
- `order`: float for catalog display sort (nulls sort last) — display-only, doesn't affect test execution

### Shared helpers

Three pure-stdlib utilities back this system. Other registries that want
the same path-based id/catalog pattern can use them directly:

- `pixsim7/common/naming.py` — `kebab()`, `humanize_label()`, `path_after_anchor()`
- `pixsim7/common/ast_metadata.py` — `extract_module_metadata()`, `find_top_level_assign()`

### Validation

```bash
pnpm test:registry:gen      # regenerate test-registry.json
pnpm test:registry:check    # verify no drift
python scripts/tests/validate_catalog.py --json  # detailed validation
```

## Pytest Markers

`pytest.ini` defines markers to keep filtering consistent:

- `service`, `domain`, `ownership`, `project_bundle`, `runtime_meta`
- plus generic markers: `unit`, `integration`, `slow`, `api`, `cli`

Use markers when adding new tests in these areas so profile and CI filtering stays readable.
