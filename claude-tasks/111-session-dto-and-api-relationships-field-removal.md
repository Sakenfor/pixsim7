**Task: Session DTO & API Relationships Field Removal (Stats-Only Relationships)**

> **For Agents (How to use this file)**
> - This task finishes the migration to `GameSession.stats["relationships"]` by removing the legacy `relationships` field from the backend model, API responses, and shared DTOs.
> - Backend stat logic and storage are already stat-only; this task aligns the **API surface and TS types**.
> - Coordinate with Tasks 107, 109, 110 where needed, but keep changes tightly scoped to session DTOs, API shapes, and direct `session.relationships` usage in frontend/game-core.

---

## Context

Current state after Task 107 + backend cleanup:

- Backend:
  - `GameSession.stats["relationships"]` is the canonical store for relationship data.
  - Legacy narrative helpers and relationship preview API are removed.
  - `StatService` no longer auto-migrates `session.relationships` → `stats["relationships"]`.
- Model/API:
  - `GameSession` in `domain/game/models.py` still has a `relationships` JSON field, but it’s now unused by core logic.
  - `PATCH /game/sessions/{id}` still accepts a `relationships` payload, which is written into `session.stats["relationships"]` via compatibility logic.
  - `GameSessionResponse` (backend) and `GameSessionDTO` (TS) still have `relationships` fields (marked deprecated on the TS side).
- Frontend/game-core:
  - Many helpers and core types still reference `session.relationships` directly for relationship state.
  - New stat-based paths are available but old fields remain.

Goal: Make relationships **stats-only end-to-end**, so:

- Backend model and API no longer expose `relationships` as a top-level JSON field.
- Shared DTOs and game-core use `stats["relationships"]` as the only source of relationship state.

---

## Phase Checklist

- [ ] **Phase 1 – Audit Remaining `relationships` Field Usage in API/DTOs**
- [ ] **Phase 2 – Update Backend Session API to Stats-Only Relationships**
- [ ] **Phase 3 – Update Shared `GameSessionDTO` and Session Update Types**
- [ ] **Phase 4 – Refactor Frontend/Game-Core to Use `stats["relationships"]` Exclusively**
- [ ] **Phase 5 – Remove `GameSession.relationships` Column and Clean Docs**

---

## Phase 1 – Audit Remaining `relationships` Field Usage in API/DTOs

**Goal:** Get a precise list of where `relationships` is still present in API responses, request models, and TS types.

**Steps:**

- Backend:
  - Inspect `pixsim7/backend/main/api/v1/game_sessions.py`:
    - `SessionUpdateRequest` (has `relationships?: Dict[str, Any]`).
    - `GameSessionResponse` (includes `relationships` field).
  - Confirm `GameSession` model still defines a `relationships` field in `domain/game/models.py`.
- Shared Types / Frontend:
  - `packages/shared/types/src/game.ts`:
    - `GameSessionDTO` (has `relationships` + `stats`).
    - `SessionUpdatePayload` (has `relationships?` + `stats?`).
  - `apps/main/src/lib/api/game.ts` and any other client modules consuming `GameSessionDTO` or sending `SessionUpdatePayload.relationships`.
- Game-core:
  - `packages/game/engine/src/core/PixSim7Core.ts` and related helpers.
  - Any tests or helpers that assume `session.relationships` exists.

Document findings here (list of files/fields) as a mini checklist for later phases.

---

## Phase 2 – Update Backend Session API to Stats-Only Relationships

**Goal:** Stop exposing `relationships` as a first-class field in the session API; use `stats["relationships"]` instead.

**Steps:**

- In `pixsim7/backend/main/api/v1/game_sessions.py`:
  - Update `SessionUpdateRequest`:
    - Remove the `relationships` field.
    - Add `stats` (if not already present) as the preferred way to update stat data.
  - Update `GameSessionResponse`:
    - Remove the `relationships` field.
    - Add a `stats` field mirroring `GameSession.stats` shape (if not already present).
  - Adjust `GameSessionResponse.from_model` to only read `gs.flags`, `gs.stats`, etc., not `gs.relationships`.
- In `GameSessionService.update_session`:
  - Remove the `relationships` parameter and compatibility path.
  - Treat `stats` as the only input for relationship changes.
  - Keep relationship normalization and stat cache invalidation logic intact, but triggered solely by `stats["relationships"]` changes.

**Note:** This will change the wire shape of `/game/sessions` APIs; coordinate with Phase 3 and 4 so TS types and callers are updated in the same change set.

---

## Phase 3 – Update Shared `GameSessionDTO` and Session Update Types

**Goal:** Make shared DTOs reflect the stats-only model so frontend/game-core can align.

**Steps:**

- In `packages/shared/types/src/game.ts`:
  - `GameSessionDTO`:
    - Remove the `relationships` field.
    - Keep `stats` as the canonical structure for relationships and other stat types.
  - `SessionUpdatePayload`:
    - Remove `relationships?` field.
    - Keep `stats?`, and note in JSDoc that relationships must be updated via `stats.relationships`.
- Ensure JSDoc/comments are updated to avoid confusion:
  - Any references to “GameSession.relationships” in comments should be updated to “GameSession.stats['relationships']”.

**Note:** This is a breaking change for any callers that rely on `relationships` in DTOs; Phase 4 covers refactors.

---

## Phase 4 – Refactor Frontend/Game-Core to Use `stats["relationships"]` Exclusively

**Goal:** Remove `session.relationships` usage from frontend and game-core and replace it with `session.stats.relationships` where needed.

**Steps:**

- Identify and refactor TS usage:
  - `apps/main/src/components/game/RelationshipDashboard.tsx`:
    - Already prefers `session.stats?.relationships` with a fallback; remove the fallback and assume `stats.relationships` only.
  - `apps/main/src/components/panels/dev/SessionStateViewer.tsx`:
    - Update to display `stats.relationships` instead of `relationships`.
  - `apps/main/src/lib/core/mockCore.ts`, `simulation/hooks.ts`, `worldTools` panels, etc.:
    - Replace `session.relationships[...]` with `session.stats.relationships[...]` accessors.
  - Game-core (packages/game/engine):
    - Update any helpers (e.g., `PixSim7Core`, `session/state.ts`, `relationships/*`) to read/write relationships via `stats.relationships` rather than `relationships`.
    - Consider adding a small helper function to resolve relationship state from `stats.relationships` for consistency.
- Update tests:
  - Adjust TS tests that construct `GameSessionDTO` fixtures to include `stats.relationships` and drop `relationships`.
  - Ensure any snapshots or JSON fixtures align with the new structure.

**Constraints:**

- Avoid changing gameplay semantics; this is a structural move only.

---

## Phase 5 – Remove `GameSession.relationships` Column and Clean Docs

**Goal:** Finally remove the `relationships` column from the DB schema and documentation.

**Steps:**

- Backend model:
  - Remove the `relationships` field from `GameSession` in `pixsim7/backend/main/domain/game/models.py`.
- Migration:
  - Add an Alembic migration that drops the `relationships` column from the `game_sessions` table.
  - Ensure this is safe for your environment (if no legacy data remains; otherwise, capture/export if needed).
- Docs:
  - Sweep remaining docs for references to `GameSession.relationships` and update them to `GameSession.stats["relationships"]` or remove them if obsolete.
  - Update any “backward compatibility” notes that still mention the `relationships` field as a projection.

**Note:** Only do this once all code and clients are confirmed to be using `stats["relationships"]` exclusively.

---

## Validation

- After completing all phases, validate:
  - Session creation, updates, and normalization paths still work for relationship data via `stats["relationships"]`.
  - Generic stat preview API returns the expected relationship tiers/levels for given inputs.
  - All frontend/game-core views and systems render relationships correctly using the new structure.

Once this task is complete, relationships will be fully stat-based from DB through backend services to frontend/game-core, with no leftover `GameSession.relationships` field in the API or type system.

