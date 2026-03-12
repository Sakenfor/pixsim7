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

## Canonical Registration (Devtools)

The canonical frontend path for introducing test metadata is:

- `apps/main/src/features/devtools/services/testCatalogRegistry.ts`
  - `registerTestProfile(...)`
  - `registerTestSuite(...)`
  - `registerTestCatalogPlugin(...)` for plugin-style batched registration

`TestOverviewPanel` and `testOverviewService` read from this registry only.  
Use compatibility reads where needed, but keep writes/registrations canonical through registry helpers.

Recommended suite metadata fields (for agent-friendly categorization):

- `category`: stable high-level area (`backend/api`, `frontend/project-bundle`, `scripts/bananza`)
- `subcategory`: focused domain inside a category (`codegen`, `lifecycle`, `runtime-meta`)
- `kind`: `unit | contract | integration | e2e | smoke`
- `covers`: source paths that the suite validates

Catalog metadata can be validated with:

```bash
pnpm test:registry:gen
python scripts/tests/validate_catalog.py
python scripts/tests/validate_catalog.py --json
```

Example:

```ts
import { registerTestCatalogPlugin } from '@/features/devtools/services/testOverviewService';

const unregister = registerTestCatalogPlugin({
  id: 'my-feature-tests',
  profiles: [
    {
      id: 'my-feature-fast',
      label: 'My Feature Fast',
      command: 'pnpm test:fast',
      description: 'Focused checks for my feature.',
      targets: ['Backend + Frontend'],
      tags: ['feature'],
      runRequest: { profile: 'fast' },
    },
  ],
  suites: [
    {
      id: 'my-feature-suite',
      label: 'My Feature Suite',
      path: 'apps/main/src/features/myFeature',
      layer: 'frontend',
      category: 'frontend/my-feature',
      subcategory: 'core',
      kind: 'integration',
      covers: ['apps/main/src/features/myFeature'],
    },
  ],
});

// call unregister() when unloading plugin/hot-reload cleanup
```

## Pytest Markers

`pytest.ini` defines markers to keep filtering consistent:

- `service`, `domain`, `ownership`, `project_bundle`, `runtime_meta`
- plus generic markers: `unit`, `integration`, `slow`, `api`, `cli`

Use markers when adding new tests in these areas so profile and CI filtering stays readable.
