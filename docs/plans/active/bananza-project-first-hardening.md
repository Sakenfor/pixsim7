# Bananza Project-First Hardening

**Status:** In Progress  
**Date:** 2026-03-05  
**Scope:** Bananza seed/runtime hardening only (no analyzer or block-language expansion).

## Audit Findings

Checked baseline behavior introduced/changed around commit `0e2ca287` and current Bananza runtime codepaths:

1. Seed identity selectors were still present in Bananza runtime metadata (`SEED_KEY` era assumptions).
2. Project snapshot overwrite/matching still depended on seed-era conventions in parts of the flow.
3. CLI watch mode only reseeded on script/source changes; it did not maintain ongoing project file/backend sync.
4. Custom block/template acceptance could still pass without strict explicit pack-registration guarantees if only existence was checked.
5. Direct flow world-state metadata still wrote seed-style marker state on every run (`seeded` flag).

## Decisions

1. Bananza bootstrap is explicit initialization only:
- Bootstrap metadata uses `bootstrap_source` + `bootstrap_profile`.
- No runtime `SEED_KEY` selectors.

2. Project persistence is project-first:
- Save/load uses normal project snapshot contracts (export bundle + save snapshot).
- Bootstrap provenance (`kind=import`) is set on create only, not restamped on overwrite.

3. Custom block/template usage is explicit:
- Required block IDs/templates must resolve from explicitly registered source/template packs.
- Implicit custom block/template injection is rejected.

4. API watch flow includes sync loop:
- Watch keeps reseed-on-source-change behavior.
- API sync runs continuously per watch tick so UI/backend edits can flow to file and file edits can flow back.

## Migration Steps

1. Remove remaining seed-key runtime constant usage; keep only bootstrap metadata.
2. Ensure both API/direct flows write bootstrap metadata, not seed-mode flags.
3. Enforce explicit pack-registration checks in required block/template verification.
4. Add API project-file sync behavior for `two_way`, `backend_to_file`, `file_to_backend`, `none`.
5. Wire CLI args (`--project-file`, `--sync-mode`) and watch loop sync behavior.
6. Add tests for snapshot create/overwrite provenance, sync push/pull logic, and pack-registration rejection.

## Verification

Targeted tests cover:

1. Snapshot create vs overwrite provenance behavior.
2. Two-way sync decisions for push/pull based on backend timestamp + file timestamp/hash.
3. Required block/template rejection when source/template packs are not explicitly registered.
4. Authority assertions that Bananza seed data no longer exports runtime `SEED_KEY`.

## Residual Risks / TODO

1. Direct mode still remains a maintenance path; API mode is the primary project-first path for sync/filewatch loops.
2. Sync conflict policy in `two_way` currently uses timestamp + hash heuristics (not full merge); manual edits can still require operator judgement.
3. CLI watch loop polls API each interval for sync; acceptable for dev loops but may need adaptive backoff if used continuously in shared environments.
