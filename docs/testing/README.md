# Testing Docs

- [Test Overview](./TEST_OVERVIEW.md) - folders, profiles, and unified runner commands
- Canonical devtools registry entrypoint: `apps/main/src/features/devtools/services/testCatalogRegistry.ts`
- `scripts/tests/run.py changed` uses generated catalog `covers` metadata first, then path heuristics for uncovered files
- `scripts/tests/run.py changed --list --json` emits machine-readable targets/commands/catalog metadata
- `scripts/tests/test-registry.json` is the generated canonical test registry artifact
- `scripts/tests/validate_catalog.py` validates suite metadata fields, duplicate IDs, and `covers` path existence
- Canonical backend root: `pixsim7/backend/tests` (legacy `backend/main/tests` paths are compatibility-read only)
