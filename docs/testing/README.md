# Testing Docs

- [Test Overview](./TEST_OVERVIEW.md) - folders, profiles, and unified runner commands
- Canonical devtools registry entrypoint: `apps/main/src/features/devtools/services/testCatalogRegistry.ts`
- `scripts/tests/run.py changed` uses registry `covers` metadata first, then path heuristics for uncovered files
- Canonical backend root: `pixsim7/backend/tests` (legacy `backend/main/tests` paths are compatibility-read only)
