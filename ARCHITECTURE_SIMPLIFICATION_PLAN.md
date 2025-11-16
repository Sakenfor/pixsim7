# PixSim7 Game / Backend Simplification Plan

**Goal:** Evolve from the current “two backends + two frontends + iframe + cross‑service imports” into a **simpler, modular monolith** that still preserves a clean path to scale out into separate services later.

The phases below are ordered so you can stop after any one of them and still have a coherent, working system. Early phases focus on developer ergonomics and correctness; later ones focus on optional future scaling.

---

## How Agents Should Use This Plan

- **Follow phases in order.** Do not jump ahead unless earlier phases are clearly complete or explicitly marked as “done” in the repository.
- **Prefer moves over rewrites.** When moving game logic into the backend, move files and adjust imports rather than re‑implementing behavior from scratch.
- **Keep public APIs stable.** If you change backend endpoints, you must update all affected frontend calls in the same pass.
- **Respect type contracts.** Do not change the shape of `@pixsim7/types.Scene` or related types without updating all producers/consumers.
- **Stay within declared scope.** Only work on phases that are explicitly marked as “READY FOR AGENT” or requested by the user; treat others as documentation.

---

## Phase 0 – Objectives & Constraints (status: GUIDANCE)

**Objectives**

- Reduce cognitive and operational overhead for a single developer (or small team).
- Remove unnecessary cross‑service coupling (imports between services, duplicated auth logic).
- Make it easy to reuse scenes and game UI across “editor” and “player” flows.
- Keep a clear boundary between **content** (assets, generation jobs) and **gameplay** (graphs, sessions, world).

**Constraints / Assumptions**

- This is currently a **personal / test** project, but may grow later.
- You are OK with file moves and renames as long as the architecture gets simpler.
- You want to keep the *option* to split the game logic into a separate service later if needed.

Outcome of Phase 0: agreement to prioritize a **modular monolith now, split later if needed**.

---

## Phase 1 – Consolidate Game Backend into `pixsim7_backend` (Modular Monolith) (status: READY FOR AGENT)

**Current**: `pixsim7_game_service` is its own FastAPI app, but it imports from `pixsim7_backend` for auth and logging, and calls the backend over HTTP for assets.

**Target**: A single FastAPI app (`pixsim7_backend/main.py`) that exposes game routes alongside existing ones, with game code isolated in a clear module.

### 1.1 – Introduce a `game` module in the backend

- Add packages under `pixsim7_backend`:
  - `pixsim7_backend/domain/game/`
  - `pixsim7_backend/services/game/`
  - `pixsim7_backend/api/v1/` entries: `game_scenes.py`, `game_sessions.py` (alongside other v1 routes).

- Copy / move domain models from `pixsim7_game_service/domain/models.py` into `pixsim7_backend/domain/game/models.py`:
  - `GameScene`, `GameSceneNode`, `GameSceneEdge`
  - `GameSession`, `GameSessionEvent`
  - `GameLocation`, `GameNPC`, `NPCSchedule`, `NPCState`

- Update imports in the new modules to use backend infrastructure:
  - Use `pixsim7_backend.infrastructure.database.session` instead of the game service’s `infrastructure/database/session.py`.
  - Ensure Alembic migrations in the backend know about the new game tables.

### 1.2 – Move game API routes into backend

- Move `pixsim7_game_service/api/v1/sessions.py` → `pixsim7_backend/api/v1/game_sessions.py` and adjust:
  - Replace `get_session` DB dependency with backend `get_db`/`AsyncSession` as appropriate.
  - Route prefix: `/api/v1/game/sessions` (or similar).
  - Keep `GameSessionService` in `pixsim7_backend/services/game/session_service.py`.

- Move `pixsim7_game_service/api/v1/scenes.py` → `pixsim7_backend/api/v1/game_scenes.py`:
  - Keep the response shape compatible with `@pixsim7/types.Scene`.
  - Use backend `AssetService` instead of HTTP client (see Phase 1.3).

- In `pixsim7_backend/main.py`:
  - `from pixsim7_backend.api.v1 import game_scenes, game_sessions`
  - `app.include_router(game_scenes.router, prefix="/api/v1/game", tags=["game-scenes"])`
  - `app.include_router(game_sessions.router, prefix="/api/v1/game", tags=["game-sessions"])`

### 1.3 – Remove HTTP hop for assets (use services directly)

**Current**: `pixsim7_game_service` calls `CONTENT_API_BASE/assets/{id}` with the user’s Authorization header.

**Target**: Game routes directly call the backend AssetService/DB.

- In the moved `game_scenes` route:
  - Replace `fetch_asset(...)` with integration via backend services:
    - Inject `AssetSvc` (`AssetService`) using backend dependencies from `pixsim7_backend.api.dependencies`.
    - Use a method like `asset_service.get_asset_for_user(asset_id, user)` to get the asset model or DTO.
  - Map `Asset` fields to `MediaSegment` just like the current HTTP client did.

Result: game logic and content logic run in one process, sharing DB and services, with less latency and fewer moving parts.

### 1.4 – Sunset standalone `pixsim7_game_service` runtime (optionally keep code for reference)

- Once routes are working in the main backend, stop running the separate `uvicorn pixsim7_game_service.main:app` in development.
- Keep the old `pixsim7_game_service` directory around temporarily as reference while you complete Phase 1–2, then archive or delete it when you’re comfortable.

---

## Phase 2 – Normalize Auth & Boundaries (status: READY FOR AGENT)

Even inside a single backend, it’s important to keep “game” domain clean.

### 2.1 – Introduce a shared auth claims type

- Create a small module `pixsim7_backend/shared/auth_claims.py`:
  - Pydantic model (or TypedDict) for decoded JWT claims (user id, roles, etc).
  - Helper that uses `AuthService` to verify the token and return claims/user.

- Make both “normal” routes and new “game” routes depend on this common helper rather than importing cross‑domain types ad hoc.

### 2.2 – Game services depend on simple user context, not full `User` model

- In `GameSessionService` and future game services:
  - Accept `user_id: int` (or a small `UserContext` struct) rather than a full ORM `User` instance where possible.
  - This reduces coupling between game domain and user domain.

### 2.3 – Keep game code in its own logical layer

- Game domain code should not reach into:
  - provider adapters,
  - job orchestration,
  - admin‑specific routes.

This ensures that, if you ever split the game out again, the dependency surface is small and obvious.

---

## Phase 3 – Simplify Frontend: Integrate Game into Main Frontend (status: READY FOR AGENT)

**Current**: The editor embeds `game-frontend` via iframe, coordinates via `postMessage`, and bridges JWTs and scenes.

**Target**: The editor uses `ScenePlayer` directly, with a simple module boundary, and calls the same backend API as everything else.

### 3.1 – Extract `ScenePlayer` and related game UI into a shared module

- In `game-frontend`, identify the reusable parts:
  - `ScenePlayer` (`game-frontend/src/components/ScenePlayer.tsx`),
  - mini‑games (e.g. `ReflexMiniGame`),
  - scene runtime helpers (`sceneCallStack`, etc).

- Move them into a reusable location, e.g.:
  - `packages/game-ui/src/ScenePlayer.tsx`, or
  - `frontend/src/modules/game/ScenePlayer.tsx` (if you don’t want a separate package yet).

- Ensure they only depend on:
  - `@pixsim7/types` Scene types,
  - `@pixsim7/ui` components,
  - generic React hooks/utilities.

### 3.2 – Use `ScenePlayer` directly in editor

- Replace the iframe panel in `frontend/src/components/layout/DockLayout.tsx` with a panel that renders `ScenePlayer` directly:
  - Use the same game API client (`apiClient.get('/game/scenes/:id')`, `/game/sessions/...`) instead of `gameApi.ts` + dev proxy.
  - Use editor state to determine whether you’re in “preview” mode (local in‑memory Scene) or “live” mode (sceneId + backend).

- Remove the iframe + `postMessage` preview bridge in the editor code path:
  - `lib/preview-bridge/*` becomes unnecessary for internal usage.
  - You can keep it only if you still want to support embedding the player elsewhere.

### 3.3 – Optional: keep `game-frontend` as a thin player wrapper

If you still want a separate “player site”:

- Keep `game-frontend`, but strip it down so it only:
  - mounts `ScenePlayer` from the shared module,
  - reads `sceneId` from URL,
  - calls `/api/v1/game/scenes/:id` and `/api/v1/game/sessions/:id` on the **main backend**.

- This removes duplicated logic: both the editor and the standalone player use the same Scene runtime code and the same API surface.

Result: you still have the option of two frontends (editor + player), but you no longer need an iframe or cross‑window protocol inside your own app.

---

## Phase 4 – Canonical Scene Schema & Storage (status: READY FOR AGENT)

You now have **one backend** and **one primary frontend**, but scenes are still mirrored in multiple places (backend content models, game models, TS types).

### 4.1 – Choose a canonical wire format (`@pixsim7/types.Scene`)

- Treat `@pixsim7/types.Scene` (and related types: `SceneNode`, `SceneEdge`, `MediaSegment`, etc.) as the **canonical wire format** for any scene used by a player.

- Backend responsibilities:
  - Provide routes that return scenes in this format:
    - `GET /api/v1/game/scenes/{id}` → `Scene` DTO.
  - Internally, you may have multiple storage forms:
    - content/editor scenes,
    - game‑specific compiled scenes, etc.
  - Always map into the canonical `Scene` type for clients.

### 4.2 – Unify editor scene builder with canonical type

- Ensure the editor’s scene‑builder stores and manipulates a structure that is either:
  - exactly the canonical `Scene`, or
  - something trivially mappable to/from it.

- When you click “preview” in the editor:
  - either pass the in‑memory `Scene` directly to `ScenePlayer`, or
  - save it, then load via `GET /api/v1/game/scenes/{id}` to exercise your mapping pipeline.

### 4.3 – Clarify how media segments relate to assets

- Adopt a clear convention for `MediaSegment` ↔ `Asset` mapping:
  - Either store `asset_id` in `SceneNode.meta.segments` (what you’re doing now), and let the backend hydrate segments with URLs and metadata.
  - Or pre‑build full `MediaSegment`s at save time (front‑load the mapping and store URLs/tags directly in scene data).

Pick one and stick to it; the current `meta.segments` + runtime hydration pattern is fine and keeps the scene format provider‑agnostic.

---

## Phase 5 – Performance & Scaling (When You Actually Need It) (status: LATER)

Once you have:

- one backend process with clear game/content modules,
- one primary frontend using shared game UI,
- a single, canonical scene format,

then you can iterate on performance **inside** this modular monolith:

- Add caching (e.g. Redis) for scene DTOs, if needed.
- Optimize DB access (indexes on game tables, eager loading).
- Use background workers for long‑running game world ticks or analytics.

Only when your metrics show a true need do you consider splitting:

- Extract `game` module into a separate service with its own DB or schema.
- Put a lightweight gateway/front‑door in front to preserve public API paths.
- Keep `@pixsim7/types.Scene` as the shared contract so frontends don’t need to change.

At that point, the refactor is mostly about deployment and configuration, not rewriting domain logic.

---

## Phase 6 – Optional: Re‑introduce Multi‑Service Architecture (Cleanly) (status: LATER)

If you reach the point where you want independent scaling/deploys for “game” vs “content”:

- Spin up `pixsim7_game_service` v2 using only:
  - code from `pixsim7_backend.domain.game`,
  - `pixsim7_backend.services.game.*`.
- Keep a small, explicit HTTP surface between services:
  - e.g. `/internal/assets/{id}` for game→content calls.
  - Use a shared `auth-common` package for JWT parsing/verification.

Because you followed Phases 1–4, this is a relatively mechanical extraction rather than a deep rewrite.

---

## Summary

- **Short term:** collapse into a modular monolith (one backend, one main frontend, shared game UI) to make development simpler and more robust.
- **Medium term:** standardize scenes and media segments around the `@pixsim7/types` schema, and make the backend the single source of truth for “playable scenes”.
- **Long term:** if needed, use the clean module boundaries you’ve created to split game logic into a separate service, without changing the external API or frontend code.

Following these phases lets you move step‑by‑step towards a simpler system today while keeping the performance and scalability options open for the future. 
