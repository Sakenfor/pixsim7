# Unified Test Runner

Entry point: `python scripts/tests/run.py <profile> [flags]`

## Profiles

- `changed`
  - Targets tests related to changed files.
  - If no changed files are found, it falls back to `fast`.
- `fast`
  - Focused regression suite for runtime/lifecycle/ownership paths.
- `project-bundle`
  - `fast` plus Bananza project sync/registration tests.
- `full`
  - Full backend (`pixsim7/backend/tests`) + frontend targets configured in the script.

## Catalog Artifact

The canonical machine-readable registry is generated to:

- `scripts/tests/test-registry.json`

Generate/update it with:

```bash
pnpm test:registry:gen
```

## Flags

- `--list` print resolved targets/commands without executing
- `--json` emit machine-readable output (requires `--list`)
- `--backend-only` run only pytest command(s)
- `--frontend-only` run only vitest command(s)

`--backend-only` and `--frontend-only` are mutually exclusive.  
`--json` is currently list-only and must be combined with `--list`.

## Manual Smoke Tests

Some smoke scripts are located under `tests/` for visibility but are skipped by default:

- `tests/parser/test_parser.py` (`RUN_PROMPT_PARSER_SMOKE=1`)
- `tests/semantic/test_semantic_packs.py` (`RUN_SEMANTIC_PACK_SMOKE=1`)
- `tests/scripts/test_media_ingestion.py` (`RUN_MEDIA_INGESTION_SMOKE=1`)

## Examples

```bash
python scripts/tests/run.py changed --list
python scripts/tests/run.py changed --list --json
python scripts/tests/run.py fast --backend-only
python scripts/tests/run.py project-bundle
python scripts/tests/run.py full
pnpm test:registry:gen
python scripts/tests/validate_catalog.py
```

## Catalog Validation

`validate_catalog.py` enforces canonical suite metadata in
`apps/main/src/features/devtools/services/testCatalogRegistry.ts`:

- unique suite IDs
- required suite fields: `category`, `subcategory`, `kind`, `covers`
- valid `layer` / `kind` values
- existing `path` / `covers` filesystem targets
- generated registry artifact exists (`scripts/tests/test-registry.json`)

## Maintenance

When adding new test folders for runtime/lifecycle/ownership work:

1. Update suite metadata (`category`, `subcategory`, `kind`, `covers`) in `apps/main/src/features/devtools/services/testCatalogRegistry.ts`.
2. Keep `covers` paths accurate so `scripts/tests/run.py changed` can do metadata-first target mapping.
3. Update target arrays in `scripts/tests/run.py` only when profile defaults/fallbacks need changes.
4. Update root `package.json` shortcuts if profile behavior changes.
5. Update `docs/testing/TEST_OVERVIEW.md` folder/profile notes.
