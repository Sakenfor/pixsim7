# Bananza Project-First Hardening

**Status:** In Progress (core hardening complete, rollout/ops cleanup ongoing)  
**Dates:** 2026-03-05 to 2026-03-06  
**Scope:** Bananza seed/runtime hardening only (no analyzer or block-language work).

## Baseline Reviewed

Primary commits reviewed for this hardening thread:

1. `0e2ca287` (`refactor(seed): move Bananza primitive/template definitions to content packs`)
2. `0a76f8f5` (`refactor(bananza): harden bootstrap and project-first runtime flows`)
3. `0f4ceb0b` (`feat(bananza): add project-file sync controls to seeder cli`)
4. `81f21454` (`test(bananza): cover project sync provenance and registration gates`)
5. `eceeb2fe` (`fix(bananza): migrate and prune legacy seed snapshots`)

## Runtime Audit: Seed-Specific Behavior Still Active

The following seed-specific behaviors are still active at runtime by design:

1. Legacy snapshot migration logic still runs during save/upsert to prefer non-legacy project rows and prune duplicates.
2. Bootstrap metadata is still stamped on bootstrapped world/NPC/location/schedule entities to preserve provenance for initial demo content ownership.
3. Seeder defaults still target demo naming (`Bananza Boat`, `Bananza Boat Seed Project`) unless project/user settings override them.
4. Seeder watch loop remains a dev-authoring bootstrap tool and still reseeds on source changes.
5. Direct mode remains available as a fallback bootstrap path, but is not the preferred project-sync runtime path.

## Runtime Audit: Seed-Era Behavior Removed

1. No runtime `SEED_KEY` selector path remains in Bananza seed data/runtime flow.
2. Primitive/template authoring is removed from Bananza seed scripts; content packs are the only authority.
3. Save/load now uses normal project snapshot contracts (full export bundle), not custom seed payload shapes.
4. Bootstrap provenance is set on create only, not repeatedly restamped on overwrite.
5. Implicit custom block/template acceptance is blocked; required IDs/slugs must come from explicitly registered packs.

## Decisions

1. Bananza is project-first at runtime: project snapshot state is the source of truth for persistence/reload.
2. Seed/demo behavior is bootstrap-only: initialization can seed content, but ongoing runtime is normal project behavior.
3. API mode is the primary runtime path for sync/filewatch loops; direct mode is maintenance fallback only.
4. Custom blocks/templates must be explicitly pack-registered; implicit injection is not allowed.
5. Project-level runtime preferences (mode/sync/watch) are persisted in project provenance metadata and reused by CLI.

## Implementation Updates (2026-03-06)

1. Project Panel now persists and reloads Bananza runtime preferences in project provenance meta (`seeder_mode`, `sync_mode`, `watch_enabled`).
2. Bananza CLI now resolves runtime config with precedence: explicit CLI flags > saved project preferences > defaults.
3. CLI project-preference lookup now prefers non-legacy snapshot rows when duplicate project names exist.
4. Direct mode now forces `sync_mode=none` to avoid accidental API-sync expectations and surfaces a clear schema-compatibility error when blocks DB schema drifts.
5. Two-way pull now writes `<project-file>.bak` before replacing a changed local file.
6. Added tests for CLI preference parsing, precedence resolution, duplicate legacy snapshot selection behavior, watch file diffing/filtering, pull-backup creation, and direct-mode schema drift handling.

## Verification

Executed:

1. `pytest scripts/seeds/game/bananza/tests/test_cli_runtime_preferences.py -q`
2. `pytest scripts/seeds/game/bananza/tests -q`

Coverage now includes:

1. Snapshot create vs overwrite provenance behavior.
2. Two-way sync push/pull decisions (`file_to_backend`, `backend_to_file`, `two_way`).
3. Pack-registration rejection for required custom blocks/templates.
4. Runtime preference parsing (`bananza_runtime` + flat key fallback) and precedence semantics.
5. Duplicate project-name preference resolution that avoids legacy seed snapshots when non-legacy rows exist.

## Migration Steps

1. Keep one canonical Bananza project snapshot per name; prune older legacy rows where safe.
2. Save Bananza project settings in UI so provenance meta includes runtime mode/sync/watch preferences.
3. Run CLI without mode/sync/watch flags to consume saved project preferences automatically.
4. Use API mode for watch/sync loops and reserve direct mode for bootstrap/debug fallback.

### Local verification note (2026-03-06)

Checked local DB rows by querying `game_project_snapshots` for `%bananza%`: currently one row (`Bananza Boat Seed Project`, `origin_kind=import`, `origin_source_key=bananza.bootstrap`). No duplicate Bananza snapshots were present at check time.

## Residual Risks / TODO

1. `two_way` sync is still timestamp/hash based and not a structural merge strategy.
2. Watch loop is polling-based; long-running shared usage may need adaptive/backoff behavior.
