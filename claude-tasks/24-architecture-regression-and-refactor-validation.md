**Task: Architecture Regression & Refactor Validation (ECS, Narrative, Scheduler, Plugins)**

> **For Agents (How to use this file)**
> - This task is a **meta‑QA pass** over the major refactors:
>   - Task 13 (behavior system), Task 16 (plugin capabilities), Task 17 (interactions),  
>   - Task 19 (ECS & metrics), Task 20 (narrative runtime, once implemented),  
>   - Task 21 (scheduler, once implemented), Task 22 (game mode), Task 23 (GameProfile).
> - Use it:
>   - After large integration changes.  
>   - Before claiming “VN + life‑sim engine is stable enough for content production.”
> - Focus is **verification**, not new features:
>   - Does everything still fit together as intended?  
>   - Are there obvious regressions or missing glue?

---

## Context

You’ve now:

- Designed and mostly implemented:
  - ECS components & metric registry for NPC/session state.  
  - Plugin capability APIs and behavior extensions.  
  - NPC interactions, chains, and suggestions.  
  - Plans for narrative runtime and world scheduler, plus GameMode/GameProfile.
- Migrated key plugins (`game-romance`, `game-stealth`) onto ECS and PluginContext.

This task is about **making sure the architecture holds under real usage**, via targeted checks and small vertical slices—not about adding more systems.

---

## Phase Checklist

- [ ] **Phase 24.1 – Code-Level Sanity Checks (Access Patterns & Conventions)**
- [ ] **Phase 24.2 – Plugin & ECS Integration Audit**
- [ ] **Phase 24.3 – Interaction & Narrative Flow Smoke Tests**
- [ ] **Phase 24.4 – Life-Sim vs VN Profile Sanity**
- [ ] **Phase 24.5 – Performance & Safety Spot Checks**

---

## Phase 24.1 – Code-Level Sanity Checks (Access Patterns & Conventions)

**Goal**  
Verify that new code respects the intended access patterns and conventions, especially around ECS and metrics.

**Scope**

- Backend: ECS helpers, metric helpers, behavior, interactions, plugins.  
- Frontend: use of types and stores (where present).

**Agent Checklist**

1. **Search for direct `session.relationships` mutations**:
   - Ensure new/refactored code reads/writes metrics via:
     - `get_npc_component` / `set_npc_component`, or  
     - `get_npc_metric` / `set_npc_metric`.  
   - Legacy reads are okay; new logic shouldn’t add more direct JSON digging.
2. **Search for direct `flags.npcs["npc:*"]` structure mutations**:
   - Prefer ECS helpers over ad‑hoc dict manipulation.  
3. **Check plugin writing patterns**:
   - Plugins using `PluginContext` should write:
     - Session-wide plugin state under `session.flags.plugins[pluginId]` *or* via `set_session_flag` (namespaced).  
     - Per-NPC plugin state via `ComponentAPI` (components[`plugin:...`]), not by manually editing flags.
4. **Flag any new “shortcuts”** that bypass ECS/Plugin APIs and note them for cleanup.

**Status:** ☐ Not started

---

## Phase 24.2 – Plugin & ECS Integration Audit

**Goal**  
Confirm that key plugins and behavior extensions are using ECS + plugin capabilities as intended.

**Scope**

- `game-romance`, `game-stealth`, any behavior extension plugins.

**Agent Checklist**

1. **game-romance**:
   - Uses `ctx.components` for per-NPC romance state (not raw flags).  
   - Registers its component schema and metrics via `BehaviorExtensionAPI.register_component_schema`.  
   - Uses `SessionMutationsAPI.update_relationship` only where it’s intentionally modifying core relationship state.
2. **game-stealth**:
   - Suspicion and stealth flags live in plugin component or namespaced flags, not in ad-hoc keys.  
   - Relationship penalties use metric/relationship helpers, not hard-coded JSON routes.
3. **Behavior extensions**:
   - Conditions/effects register via `BehaviorExtensionAPI`, namespaced IDs, and show up in `behavior_registry`.  
   - No plugin writes directly into core components that it doesn’t own.

**Status:** ☐ Not started

---

## Phase 24.3 – Interaction & Narrative Flow Smoke Tests

**Goal**  
Validate that the interaction + narrative stack behaves sensibly in practice, using one or two small vertical slices.

**Scope**

- Interactions API, chains, suggestions, and (once implemented) narrative runtime.

**Agent Checklist**

1. **Pick or define a micro-scenario**:
   - The “rooftop VN slice” described earlier:  
     - One world, one location, one romance NPC, 1–2 interactions, one narrative program.  
2. **Exercise the flow end-to-end**:
   - Start in `Game2D` or a dedicated playtest route.  
   - Trigger an interaction from the interaction menu.  
   - Verify:
     - Availability/gating respects ECS metrics (core + plugin metrics).  
     - Execution applies relationship deltas, flags, and ECS changes as expected.  
   - If narrative runtime is in place:
     - Confirm conversation mode is entered (GameMode/gameState updated).  
     - Choices and outcomes correctly modify ECS components.
3. **Check UI surfaces**:
   - Interaction suggestions make sense (no obviously bizarre scoring).  
   - Chains/steps progress when expected; cooldowns behave correctly.

**Status:** ☐ Not started

---

## Phase 24.4 – Life-Sim vs VN Profile Sanity

**Goal**  
Confirm that `GameProfile` and simulation modes effectively switch behavior between life-sim and VN-style worlds, without separate code paths.

**Scope**

- At least two worlds: one tuned `life_sim`, one `visual_novel`.

**Agent Checklist**

1. **Configure two test worlds**:
   - World A:  
     - `style = "life_sim"`, `simulationMode = "real_time"` or `"turn_based"` with short turns.  
   - World B:  
     - `style = "visual_novel"`, `simulationMode` matching your intended VN feel.
2. **Behavior**:
   - World A: NPCs show varied routine behavior; suggestions favor everyday actions.  
   - World B: Simulation feels lighter; key NPCs are simulated more intensely when in conversation or scenes.
3. **Interactions & narrative**:
   - World A: more inline/ambient interactions; narrative reserved for big events.  
   - World B: majority of meaningful progress flows through narrative programs & choices.
4. **Game2D & UI**:
   - In turn-based worlds, ensure time advancing is clearly tied to explicit actions (Next Turn, sleep, etc.).  
   - In VN worlds, ensure you’re not forced into turn-based loops unless deliberately configured.

**Status:** ☐ Not started

---

## Phase 24.5 – Performance & Safety Spot Checks

**Goal**  
Do a light, qualitative check that the architecture won’t collapse under modest load and that safety measures still work.

**Scope**

- Simulation/load, generation, plugins, and logging.

**Agent Checklist**

1. **Simulation density**:
   - With a medium world (dozens of NPCs), run a short playthrough and watch:
     - Simulation tier usage.  
     - Per-tick NPC counts.  
     - Whether any hot loops appear.  
   - Ensure scheduler limits (when implemented) are respected.
2. **Generation load**:
   - Generate multiple assets concurrently from interactions and direct calls.  
   - Confirm ARQ/backpressure and quotas still behave as expected.
3. **Plugin safety**:
   - Temporarily misconfigure a plugin (request unknown permissions, register conflicting components) and ensure:
     - Plugin permissions validation warns and blocks where appropriate.  
     - Behavior registry locks prevent late/duplicate registrations after lock.  
     - Plugin errors in hooks don’t crash the core.
4. **Logging & observability**:
   - Confirm key systems log enough context (world_id, session_id, npc_id, plugin_id) to debug issues.

**Status:** ☐ Not started

---

## Success Criteria

After running this task (even partially), you should have:

- Confidence that **new access patterns (ECS, metrics, PluginContext)** are respected and not regressing into ad-hoc JSON.  
- Evidence that at least one **life-sim style** and one **VN style** world behave differently **via configuration**, not forks.  
- A minimal vertical slice showing interactions, plugins, and narrative working together.  
- Clear notes on any remaining sharp edges or shortcuts to clean up in follow-up work.

