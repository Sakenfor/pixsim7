# Backend Game Extraction Plan (v3)

## Status: Draft — Checkpoint at Phase 0–4 (dual-DB monolith), defer Phase 5–6

---

## 1. Goals and Non-Goals

### 1.1 Goals

1. Move all game-owned data to a dedicated `GAME_DATABASE_URL`.
2. Keep assets/generation/provider/user data in main backend DB.
3. Keep auth centralized in main backend (single issuer/trust model).
4. Prove the split inside the monolith (dual-DB, single process) before any service extraction.
5. Execute incrementally with rollback points at each phase.

### 1.2 Non-Goals

1. No big-bang rewrite.
2. No duplication of user/account/provider ownership logic across services.
3. No hard FK coupling between game DB and main DB.
4. No separate service deployment yet — defer Phase 5–6 until a clear trigger (team growth, deploy independence needs, or game changes destabilizing main backend).

### 1.3 Checkpoint Strategy

**Phase 0–4 = "do now" milestone.** Result: one monolith, two databases, clean boundaries, game data fully isolated. This is the stable resting state.

**Phase 5–6 = "do later" milestone.** Only when: (a) team grows beyond solo, (b) independent deploy cycles are needed, or (c) game changes are destabilizing the asset pipeline.

---

## 2. Hard Decisions (Locked In)

1. **All game-related tables move to game DB**, even if currently located under non-game modules.
2. **Assets remain in main backend** and are consumed by game via explicit read contracts.
3. **Auth remains shared with main backend** (JWT issued centrally; game service trusts same issuer and revocation source).
4. **Cross-domain references are soft references** (`asset_id`, `prompt_version_id`, etc.), not cross-DB FKs.

---

## 3. Current Gaps to Fix Before Extraction

### 3.1 Hard FK coupling (verified)

**5 hard FKs to `users.id`** in `domain/game/entities/npc_memory.py`:
- `npc_conversation_memories.user_id` → `users.id`
- `npc_conversation_topics.user_id` → `users.id`
- `npc_relationship_milestones.user_id` → `users.id`
- `npc_personality_evolution.user_id` → `users.id` (nullable)
- `npc_dialogue_analytics.user_id` → `users.id`

Plus 3 soft refs (no FK constraint): `game_sessions.user_id`, `game_worlds.owner_user_id`, `game_project_snapshots.owner_user_id`.

### 3.2 Asset→Game FK (verified)

`clip_sequences` in `domain/assets/sequence.py` has hard FKs to `characters.id` and `game_npcs.id`. Currently unused (no services, no routes, no API endpoints) but the FK constraints exist in the DB. Must be reclassified as game-owned or have FKs removed.

### 3.3 Model/migration type mismatch (verified — this is a bug)

`Character.game_npc_id` in model: `Optional[UUID]` with `foreign_key="npcs.id"`.
Migration: `sa.Column('game_npc_id', sa.Integer())` with FK to `game_npcs.id`.
Actual `game_npcs.id` is `Integer`. The model has both wrong type (UUID vs Integer) and wrong target (`npcs.id` vs `game_npcs.id`).

### 3.4 Game routes outside `game_*.py` naming (verified — 6 files)

- `characters.py` — imports `CharacterService`, `Character`
- `character_graph.py` — imports graph builders, does `select(Asset)` ORM queries
- `npc_state.py` — imports `MemoryService`, `EmotionalStateService`, etc.
- `stat_preview.py` — imports `GameWorld`, `StatEngine`, `WorldStatsConfig`
- `analytics.py` — imports `DialogueAnalyticsService`
- `interactions.py` — imports interaction models, availability, target adapters

### 3.5 Auth dependency returns full DB User (verified)

`get_current_user()` does 2–3 DB queries (UserSession lookup + User load). Game routes only use `user.id` for ownership checks. Needs `AuthPrincipal` claims-based alternative.

---

## 4. Ownership Model (Source of Truth)

### 4.1 Moves to Game DB

1. All `game_*` tables.
2. Character registry and integrations (`characters`, `character_instances`, `character_usage`, manifests, links tied to game runtime).
3. NPC runtime state/memory/analytics tables (`npc_conversation_*`, `npc_relationship_*`, `npc_personality_*`, `npc_dialogue_*`).
4. `clip_sequences` + `clip_sequence_entries` (game-owned behaviorally, despite current assets module location).
5. Game-specific link/sync tables and plugin state tied to game runtime.

### 4.2 Stays in Main DB

1. `users`, `user_sessions`, auth/session tables.
2. `assets`, `generations`, providers/accounts/billing.
3. Prompt authoring tables (`prompt_versions`, `action_blocks`) unless explicitly re-homed later.

### 4.3 Reference Rules

1. Game DB may store `asset_id`, `generation_id`, `prompt_version_id`, `action_block_id`, `user_id` as scalar references.
2. No FK from game DB to main DB.
3. Referential validation happens in service layer via ports/clients.

---

## 5. Target Architecture

### 5.1 Services

1. **Main backend**: auth issuer + users + assets + generation + providers.
2. **Game backend**: world/session/NPC runtime + character systems + game APIs.

### 5.2 Contracts

1. **Auth contract**:
   - Main backend issues JWTs.
   - Game backend validates JWT signature/claims and revocation status.
2. **Asset read contract**:
   - Game backend fetches asset metadata/media URLs/tags through main backend API (or internal client).
3. **Event contract**:
   - Optional Redis/Kafka channels for cache invalidation and domain events.

---

## 6. Phased Plan

### Phase 0 - Ownership Inventory and Boundary Gates

**Goal:** Freeze architecture drift before moving data.

**Steps:**
1. Produce table ownership manifest (`game` vs `main`) and check it into repo.
2. Add import boundary rules (domain + service + API layers), not only `domain/game`.
3. Add CI check: no new cross-domain hard FKs in models/migrations.
4. Enumerate all game-coupled routes (including non-`game_*.py`).

**Deliverable:** CI-enforced boundaries + explicit table ownership list.

---

### Phase 1 - Shared Auth Federation for Game APIs

**Goal:** Keep one auth system while removing game-service dependency on main DB user/session tables.

**Steps:**
1. Introduce `AuthPrincipal` (claims-based identity) for game APIs.
2. Keep existing `User` dependency for main backend routes that need DB user records.
3. Add revocation strategy for game service:
   - Option A: token introspection endpoint in main backend + short cache.
   - Option B: revoked JTI push stream (Redis pub/sub) + local denylist cache.
4. Add compatibility layer so monolith can run both auth modes during migration.

**Deliverable:** Game routes can authenticate without querying main DB tables directly.

---

### Phase 2 - Schema Decoupling and Migration Split

**Goal:** Make game schema fully independent.

**Steps:**
1. Remove game-table FKs to `users.id`, `prompt_versions.id`, `action_blocks.id`.
2. Reclassify/move `clip_sequences` and related schema to game migration chain.
3. Fix `Character.game_npc_id` target mismatch (`npcs.id` -> `game_npcs.id` or remove FK).
4. Create separate Alembic branch/env for game schema.
5. Add migration tests for independent upgrade/downgrade of each chain.

**Deliverable:** `alembic -x db=game upgrade head` works with no dependency on main schema except logical references.

---

### Phase 3 - Dual-DB Runtime Inside Monolith

**Goal:** Prove data split before service split.

**Steps:**
1. Add `GAME_DATABASE_URL` and game-scoped session factory.
2. Route game repositories/services to game session; main services remain on main session.
3. Convert game-asset reads to explicit port/client (e.g., `AssetReadPort`) across:
   - scene rendering endpoints,
   - character graph asset lookups,
   - any tag/media enrichment paths.
4. Group all game APIs into one router package (including currently non-`game_*.py` game routes).
5. Add integration test harness booting game router package with mocked asset/auth ports.

**Deliverable:** One process, two DBs, clear service contracts, isolated game API test suite.

---

### Phase 4 - Data Migration and Cutover

**Goal:** Move existing game data to game DB and switch writes over.

**Steps (simplified for solo dev — no CDC/dual-write needed):**
1. Write a one-time migration script that copies game-owned tables from main DB to game DB.
2. Run consistency checks: row counts per table, spot-check a sample of records.
3. Switch game services to write to game DB (already wired in Phase 3).
4. Verify game features work end-to-end against game DB.
5. Keep main DB game tables read-only as rollback safety net for 1–2 weeks.
6. Drop game tables from main DB once confident.

**Deliverable:** Game DB is the sole source of truth for game data. Main DB no longer has game tables.

**THIS IS THE CHECKPOINT.** The monolith now runs on two databases with clean boundaries. Stop here until a trigger for Phase 5–6 appears.

---

### Phase 5 - Extract Game Service (DEFERRED)

> **Trigger:** Only start when team grows, independent deploys are needed, or game changes are destabilizing main backend.

**Goal:** Deploy game runtime as standalone FastAPI service.

**Steps:**
1. Create `pixsim7/backend/game/` (or `apps/game-backend/`).
2. Move game domain/services/routes and game plugins.
3. Replace in-process main-backend calls with HTTP/internal client contracts.
4. Keep shared auth trust model from Phase 1.
5. Namespace event channels and caches per service.
6. Add service-level SLOs, health checks, and readiness checks (DB + auth + main-api dependency).

**Deliverable:** Independently deployable game backend with isolated DB.

---

### Phase 6 - Cleanup (DEFERRED)

**Goal:** Remove legacy coupling and finalize architecture.

**Steps:**
1. Remove game code from main backend codebase.
2. Remove obsolete imports, adapters, and compatibility shims.
3. Lock CI rules to prevent regressions.

**Deliverable:** Stable two-service architecture with clean ownership boundaries.

---

## 7. Testing Strategy (Mandatory)

1. **Contract tests**:
   - Auth contract (token validation + revocation behavior).
   - Asset read contract (availability, authz, latency budgets).
2. **Migration tests**:
   - Independent chain upgrades.
   - Backfill idempotency + rollback scripts.
3. **Integration tests**:
   - Game API package with mocked main backend contracts.
   - Dual-DB monolith smoke tests.
4. **E2E tests**:
   - Main + game service interaction for core user journeys.
5. **Failure tests**:
   - Main backend asset API unavailable.
   - Revocation channel lag/outage.
   - Partial DB outage.

---

## 8. Risks and Mitigations

### Phase 0–4 Risks (active)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data migration loses rows | Low | High | Row count checks + keep main DB tables read-only as rollback |
| Dual-DB connection pool overhead | Low | Low | Same Postgres instance, two databases — minimal overhead |
| Hidden game routes missed in inventory | Medium | Medium | Phase 0 router audit + CI lint on imports |
| Cross-domain FK reintroduced | Low | High | Schema CI lint + migration review checklist |
| Character FK bug causes runtime errors | Already exists | Medium | Fix in Phase 2 regardless of extraction |

### Phase 5–6 Risks (deferred, not active)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Auth drift between services | Medium | High | Shared auth contract + contract tests |
| Asset lookup latency from game service | Medium | Medium | Caching, bulk endpoints, request coalescing |
| Debugging across service boundaries | Medium | Medium | Structured logging, correlation IDs |

---

## 9. Exit Criteria by Phase

| Phase | Exit Criteria |
|------|---------------|
| 0 | Ownership manifest and boundary gates merged in CI |
| 1 | Game endpoints run on claims-based principal without main DB user lookup |
| 2 | Game migration chain independent; cross-domain hard FKs removed |
| 3 | Monolith runs dual DB; game API package passes isolated integration tests |
| 4 | Backfill validated; shadow reads green; dual-write stable |
| 5 | Game service deploys independently; contract tests green in CI/CD |
| 6 | Legacy game paths removed from main backend; ownership boundaries enforced |

---

## 10. Open Decisions

1. Revocation implementation for shared auth (introspection vs pushed denylist).
2. Whether prompt authoring references remain soft refs or move with game later.
3. Whether to proxy old game endpoints through main backend during transition.
4. Event transport final form (Redis only vs Kafka/NATS for long-term scale).

---

## 11. Recommended Implementation Order

### Now (Phase 0–4)

1. **Phase 0 + Phase 1** begin in parallel.
2. **Phase 2** starts once ownership manifest is locked (Phase 0 done).
3. **Phase 3** begins after auth federation (Phase 1) and schema split (Phase 2) are stable.
4. **Phase 4** starts after dual-DB monolith passes integration tests (Phase 3 done).
5. **STOP.** Monolith with two DBs is the stable resting state.

### Later (Phase 5–6) — only on trigger

6. Phase 5–6 only when: team grows beyond solo, independent deploy cycles are needed, or game changes are destabilizing the asset pipeline.
