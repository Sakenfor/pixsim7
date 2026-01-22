**Task: Game Runtime & Controller Layer (Session ⇄ UI Glue)**

> **For Agents (How to use this file)**
> - This task introduces a thin **GameRuntime/GameController** layer in `packages/game/engine` that sits between session/state APIs and UI surfaces.
> - Goal: centralize game session orchestration (loading/saving, applying interactions, advancing world time, emitting events) so UIs (2D, overlays, HUD) are simple consumers, not ad‑hoc state managers.
> - Do **not** duplicate backend logic; reuse existing interaction schemas, stat systems, and plugins.

---

## Context

Current frontend/game-core structure:

- `apps/main`:
  - Scene/world editors, panel UIs, 2D playtest, debug panels.
  - Calls backend APIs directly (`game.ts`) and manipulates `GameSessionDTO` in multiple places.
- `packages/game/engine`:
  - Game-core helpers (`relationships`, `interactions`, `generation`, `behavior`, etc.).
  - `PixSim7Core` for headless relationship/brain state projections (still oriented around `session.relationships` in some areas).

What’s missing is a clear **runtime/controller** layer that owns:

- The authoritative **client-side view** of a `GameSessionDTO` + `GameWorldDetail`.
- Application of **interaction outcomes** to session state (flags, stats, world_time).
- A single event stream for “sessionLoaded”, “sessionUpdated”, “npcRelationshipChanged”, etc.

Today, UIs and helpers touch `GameSessionDTO` and APIs directly, which makes it harder to:

- Swap in different frontends using the same core.
- Hook in gating plugins, stat-based behavior, or world-time simulation in one place.

---

## Goals

- Introduce a `GameRuntime` in game-core that:
  - Owns `GameSessionDTO` + `GameWorldDetail` on the client side.
  - Provides methods to load/save sessions, apply interactions, and advance world time.
  - Emits typed events that UIs can subscribe to.
- Introduce a `GameController` that:
  - Maps UI/input events into **intents** (interact, choose option, advance time, etc.).
  - Calls `GameRuntime` methods and forwards events to surfaces.
- Ensure **relationship and stat logic** (Tasks 107, 111, 112, 109, 110) flows through this runtime instead of being scattered across React components.

Out of scope:

- Replacing backend interaction APIs (e.g., `/interactions/execute`) with client-only logic.
- Redesigning the 2D renderer or scene graph; this task is about orchestration, not rendering.

---

## Phase Checklist

- [ ] **Phase 1 – Design GameRuntime and GameController Interfaces**
- [ ] **Phase 2 – Implement Core GameRuntime Skeleton (Load/Save + Events)**
- [ ] **Phase 3 – Integrate Runtime with Interactions & Stats**
- [ ] **Phase 4 – Add GameController Layer for Input → Intents**
- [ ] **Phase 5 – Wire a First UI Surface to the Runtime**

---

## Phase 1 – Design GameRuntime and GameController Interfaces

**Goal:** Define minimal, stable interfaces for the runtime/controller layer that can be implemented incrementally.

**Steps:**

- In `packages/game/engine/src/runtime/` (new folder), define TS interfaces:
  - `GameRuntimeConfig`:
    - `apiClient: GameApiClient` (wrapper over `/game/sessions`, `/game/worlds`, `/interactions`, etc.).
    - `storageProvider?: SessionStorage` (local/session storage for offline caching).
    - `plugins?: GameRuntimePlugin[]` (gating, romance, behavior extensions).
  - `GameRuntimeEvents`:
    - `sessionLoaded`, `sessionUpdated`, `npcRelationshipChanged`, `worldTimeAdvanced`, etc.
  - `GameRuntime`:
    - `loadSession(sessionId: number): Promise<void>`.
    - `getSession(): GameSessionDTO | null`.
    - `applyInteraction(payload: InteractionIntent): Promise<GameSessionDTO>`.
    - `advanceWorldTime(deltaSeconds: number): Promise<GameSessionDTO>`.
    - `on(event, handler)`, `off(event, handler)` for event subscription (reuse a small typed emitter like PixSim7Core).
  - `GameController`:
    - `handleInput(intent: GameInputIntent): Promise<void>` (wraps `GameRuntime` calls).
    - `attachRuntime(runtime: GameRuntime)`.

**Notes:**

- Keep interfaces generic; plug in relationship adapters, gating plugins, etc., in later phases.

---

## Phase 2 – Implement Core GameRuntime Skeleton (Load/Save + Events)

**Goal:** Implement a basic `GameRuntime` that handles session loading/saving and emits events, without integrating interactions yet.

**Steps:**

- Implement `GameRuntime` in `GameRuntime.ts`:
  - Store `session: GameSessionDTO | null` and `world: GameWorldDetail | null` internally.
  - Implement `loadSession(sessionId)`:
    - Use `apiClient.fetchSession(sessionId)` and (optionally) `apiClient.getWorld(worldId)`.
    - Assign internal state and emit `sessionLoaded` / `sessionUpdated` events.
  - Implement `getSession()` and basic event subscription (`on`/`off`) using the typed emitter pattern already used in `PixSim7Core`.
  - Implement `saveSession` helper if needed (e.g. PATCH via `apiClient.updateSession` with versioning).

**Constraints:**

- Do not integrate interaction/execution logic yet; focus on the load/save + event wiring.

---

## Phase 3 – Integrate Runtime with Interactions & Stats

**Goal:** Add methods to `GameRuntime` to apply interaction outcomes and advance world time, using existing helpers and APIs.

**Steps:**

- Define an `InteractionIntent` type (in `runtime/types.ts`), which encapsulates:
  - Interaction ID, NPC ID, hotspot, optional payload (e.g. dialogue choice).
  - Enough info to call backend `/interactions/execute` or a local helper.
- Implement `applyInteraction(intent)` in `GameRuntime`:
  - Call the existing backend route (e.g. `/api/v1/npc-interactions/execute`) via `apiClient`, or use a helper that wraps it.
  - Update internal `session` with the returned `GameSessionDTO` (including updated `stats` and `flags`).
  - Emit `sessionUpdated` and `npcRelationshipChanged` events for any affected NPC IDs (using the stat-based relationship adapter from Task 112).
- Implement `advanceWorldTime(deltaSeconds)`:
  - Use `apiClient.updateSession` (or a dedicated endpoint) with `world_time` and any needed flags.
  - Update internal session and emit `worldTimeAdvanced` + `sessionUpdated` events.
- Ensure relationship/stat updates flow through the same path as regular updates so gating/behavior systems see consistent state.

**Notes:**

- Reuse relationship/state adapters that read from `stats["relationships"]` (Task 112), not legacy `relationships` fields.

---

## Phase 4 – Add GameController Layer for Input → Intents

**Goal:** Introduce a `GameController` that translates UI input into `InteractionIntent` and runtime calls, so UIs don’t talk to the runtime directly.

**Steps:**

- Define a `GameInputIntent` type (in `runtime/types.ts`), e.g.:
  - `'interact'` with hotspot ID / NPC ID.
  - `'selectOption'` with dialogue choice ID.
  - `'advanceTime'` with deltaSeconds.
- Implement `GameController` in `GameController.ts`:
  - Holds a reference to a `GameRuntime` instance.
  - Implements methods like:
    - `handleInput(intent: GameInputIntent)`: maps to the appropriate `GameRuntime` call (`applyInteraction` / `advanceWorldTime`).
  - Provides simple hooks or callbacks for UI code:
    - E.g., React hooks that call `controller.handleInput({ type: 'interact', ... })`.

**Notes:**

- Keep controller stateless where possible (just translating inputs and delegating to the runtime); runtime remains the single source of truth for session/world state.

---

## Phase 5 – Wire a First UI Surface to the Runtime

**Goal:** Prove the design by wiring a single UI surface (e.g. 2D playtest or a debug panel) through `GameRuntime`/`GameController` instead of ad‑hoc calls.

**Steps:**

- Choose a surface to integrate first, e.g.:
  - 2D playtest route (`apps/main/src/routes/Game2D.tsx`).
  - A dev panel that shows session state and allows a few basic interactions.
- Implement a thin adapter/hook in `apps/main`:
  - Instantiate `GameRuntime` with the existing `apiClient` and storageProvider.
  - Instantiate `GameController` with that runtime.
  - Subscribe to `GameRuntimeEvents` and update component state from them.
  - Replace direct API/`GameSessionDTO` manipulations in that surface with calls to `GameController.handleInput`.
- Verify that:
  - Session loads correctly and the UI updates via runtime events.
  - Interactions update `stats`/`flags` and UIs see updates via the runtime.
  - Relationship-based surfaces (e.g. RelationshipDashboard) can be wired to runtime state instead of fetching session separately.

---

## Validation & Notes

- After Phase 5, you should have:
  - A reusable `GameRuntime`/`GameController` in `packages/game/engine`.
  - At least one surface in `apps/main` using them instead of direct API/DTO manipulation.
  - Event-driven updates for session/world state, making it easier to plug in gating plugins, behavior systems, and future view modes.
- Future tasks can:
  - Add richer plugins to `GameRuntime` (gating, behavior, narrative).
  - Extend `GameController` with input mapping (keyboard/controller/gesture) without changing how state is stored.

