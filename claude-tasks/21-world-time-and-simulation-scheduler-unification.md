**Task: World Time & Simulation Scheduler Unification (Big Refactor)**

> **For Agents (How to use this file)**
> - This is a **large, systemic refactor** to unify world time management, NPC simulation, and background job scheduling.
> - Start this after:
>   - Task 13 (behavior system) and Task 19 (NPC ECS) are stable.
>   - You have a clear picture of how ARQ workers, Redis, and event handlers are used in your environment.
> - Read these first:
>   - `docs/GRAPH_UI_LIFE_SIM_PHASES.md` – life-sim / world integration  
>   - `docs/SYSTEM_OVERVIEW.md` – backend architecture overview  
>   - `docs/behavior_system/README.md` – behavior system structure  
>   - `pixsim7_backend/infrastructure/events/*` – event bus & handlers  
>   - `pixsim7_backend/workers/job_processor.py` (or equivalent) – background job processing  
>   - `pixsim7_backend/domain/game/session.py` – session & world time fields.
> - Constraint: **no heavy DB schema changes** unless clearly justified; prefer:
>   - `GameWorld.meta` / `GameSession.flags` / `GameSession.world_time` for configuration.  
>   - Existing `generations`, `prompt_versions`, `device_agents`, etc., for jobs.

---

## Context & Pain Points

Current simulation/scheduling is split across several layers:

- **World time & sessions**:
  - `GameSession.world_time` (or equivalent) tracks per-session world time.
  - Behavior system (Task 13) uses world/session time to decide activity windows and simulation tiers.
- **NPC Behavior Simulation**:
  - Behavior system runs per-world/per-NPC “ticks” to choose activities and apply effects.
  - Simulation tiers (active/ambient/dormant) control frequency and detail.
- **Background jobs & workers**:
  - Generations processed via ARQ workers (Redis queue).  
  - Event handlers react to `job:*` events (`auto_retry`, metrics, webhooks).
- **Interactions & narrative**:
  - Interaction chains and cooldowns depend on time (waitMinutes/waitHours/waitDays, cooldownSeconds).  
  - Narrative programs (Task 20) and pending dialogue/action-blocks can also be time-sensitive.

Pain points:

- No single, authoritative concept of **“what should run this tick?”**
  - Behavior, generation processing, and event handlers all have their own scheduling.
- Hard to reason about **load**:
  - NPC simulation and generation jobs might spike independently.  
  - Difficult to cap work per tick or per shard consistently.
- Time semantics vary:
  - Some systems use “world_time” (in-game seconds).  
  - Others use real-time wall clock.  
  - Cooldowns/time-based chains mix both.

**Goal:** Introduce a unified **World Simulation Scheduler** that:

- Owns world/session time advancement semantics.  
- Orchestrates NPC simulation ticks per world and per tier.  
- Integrates with generation job backpressure and event handling.  
- Provides clear guarantees about maximum work per step and where to plug new systems in.

---

## High-Level Design

### World Simulation Units

Define clear simulation units:

- **World Simulation Context**:
  - (world_id, shard_id?) with:
    - `currentTime` (in-game world time).  
    - `timeScale` (real-time to game-time factor).  
    - `maxNpcTicksPerStep`, `maxJobOpsPerStep` limits.
- **Simulation Tiers** (already present conceptually):
  - `detailed` – NPCs near player or critical to current scene.  
  - `active` – NPCs relevant to current session or arcs.  
  - `ambient` – NPCs in the same world but not near/focused.  
  - `dormant` – NPCs not actively simulated; only coarse updates.

### Scheduler Responsibilities

A single scheduler (or small cluster per shard) is responsible for:

- Advancing **world_time** for each active world/session.  
- Deciding which NPC entities get simulated this step (based on tier and priorities).  
- Enqueuing generation jobs when necessary, respecting quotas.  
- Running periodic tasks (auto-retry checks, cleanup, metrics snapshots) in a controlled manner.

The scheduler itself doesn’t do heavy work; it:

- Computes a **work plan** per tick (which NPCs to tick, which queues to drain).  
- Calls into:
  - Behavior ECS helpers + behavior system.  
  - Interaction chain progression logic.  
  - Generation queue (ARQ) with max allowed operations.

### Time Semantics

Key decisions:

- **World time** (game-time) flows deterministically based on:
  - Real-time intervals (for live games).  
  - Or explicit “step” calls (for editor/simulation mode).
- Systems that care about “wait X in-game hours” (chains, behaviors) should use world_time, not wall clock.
- Real-time concerns (job retries, backoffs) remain on wall clock, but are integrated into the scheduler work plan.

---

## Phase Checklist

- [ ] **Phase 21.1 – Inventory Time & Scheduling Usage**
- [ ] **Phase 21.2 – World Simulation Context & Config Schema**
- [ ] **Phase 21.3 – Central Scheduler Design & API**
- [ ] **Phase 21.4 – NPC Simulation Loop Integration (Behavior + ECS)**
- [ ] **Phase 21.5 – Generation Queue & Backpressure Integration**
- [ ] **Phase 21.6 – Interaction/Chain Cooldowns & Time-Based Logic**
- [ ] **Phase 21.7 – Observability, Limits, and Admin Controls**

---

## Phase 21.1 – Inventory Time & Scheduling Usage

**Goal**  
Map all the places that use time, ticks, or background scheduling so the scheduler can own them.

**Scope**

- `GameSession.world_time` and related fields.  
- Behavior simulation loop(s) from Task 13.  
- ARQ worker job model and how generations are queued.  
- Event handlers that use timers or periodic checks.  
- Interaction chains and cooldowns that use `waitSeconds/minutes/hours` or cooldown fields.

**Key Steps**

1. List all time-based mechanisms:
   - Functions that reference world_time, `datetime.utcnow()`, or `time.time()`.  
   - Any explicit loops or periodic tasks in workers/event handlers.
2. Categorize each into:
   - **World-time-driven** (game logic, NPC simulation, chains).  
   - **Real-time-driven** (provider retries, auto-retry, rate limiting).  
3. Add an "Inventory Summary" section at bottom of this file (table: System → Time source → Scheduling mechanism).

**Status:** ✅ Complete

---

## Phase 21.2 – World Simulation Context & Config Schema

**Goal**  
Define a world-level configuration and in-memory structure for simulation control.

**Scope**

- World meta schema additions and a runtime “context” struct.

**Key Steps**

1. Extend `GameWorld.meta` with a `simulation` block:

```json
"meta": {
  "simulation": {
    "timeScale": 60,              // 1 real second = 60 game seconds
    "maxNpcTicksPerStep": 50,
    "maxJobOpsPerStep": 10,
    "tickIntervalSeconds": 1,     // real-time
    "tiers": {
      "detailed": { "maxNpcs": 20 },
      "active":   { "maxNpcs": 100 },
      "ambient":  { "maxNpcs": 500 },
      "dormant":  { "maxNpcs": 5000 }
    }
  }
}
```

2. Add TS + Pydantic schemas for `WorldSimulationConfig`.
3. Define a `WorldSimulationContext` in backend code:
   - Holds `world_id`, `current_world_time`, `config`, and any transient scheduling state.
4. Decide how to persist `world_time`:
   - Either on `GameWorld` (shared across sessions) or per `GameSession`.

**Implementation Notes:**

1. **Pydantic Schemas** (`pixsim7_backend/domain/game/schemas.py`)
   - Added `WorldSchedulerTierConfigSchema` - per-tier NPC limits
   - Added `WorldSchedulerConfigSchema` - complete scheduler configuration
   - Added `get_default_world_scheduler_config()` helper function
   - Config stored in `GameWorld.meta.simulation`

2. **TypeScript Types** (`frontend/src/types/game.ts`)
   - Added `WorldSchedulerTierConfig` interface
   - Added `WorldSchedulerConfig` interface
   - Added `getDefaultWorldSchedulerConfig()` helper function
   - Added `GameWorld`, `GameWorldState`, `GameSession`, `GameNPC` types

3. **Runtime Context** (`pixsim7_backend/services/simulation/context.py`)
   - Implemented `WorldSimulationContext` dataclass
   - Tracks world time, config, and transient state
   - Includes per-tick counters and performance metrics
   - Provides `advance_time()`, `can_simulate_more_npcs()`, `can_enqueue_more_jobs()` methods
   - Includes `get_stats()` for observability

4. **World Time Persistence Decision:**
   - **Primary**: `GameWorldState.world_time` is the authoritative world-level time
   - **Per-session**: `GameSession.world_time` remains for session-specific overrides or independent time
   - **Default behavior**: Sessions use world time unless explicitly overridden
   - **Rationale**: Allows shared simulation across sessions while supporting special cases (replay, time travel, isolated sessions)

**Status:** ✅ Complete

---

## Phase 21.3 – Central Scheduler Design & API

**Goal**  
Design the central scheduler abstraction that coordinates simulation ticks, generation scheduling, and periodic tasks.

**Scope**

- A backend service module (e.g. `pixsim7_backend/services/simulation/scheduler.py`).

**Key Steps**

1. Define core scheduler interface:

```python
class WorldScheduler:
    async def tick_world(self, world_id: int, delta_real_seconds: float) -> None: ...
    async def register_world(self, world_id: int) -> None: ...
    async def unregister_world(self, world_id: int) -> None: ...
```

2. `tick_world` should:
   - Compute delta game-time (`delta_game_seconds = delta_real_seconds * timeScale`).  
   - Update world_time (and/or session world_time).  
   - Build a work plan: which NPCs/tiers to simulate, how many job operations to allow.  
3. Decide deployment:
   - Called from:
     - A simple loop in the main app for local dev.
     - A dedicated worker process (or set of workers) in production.

**Implementation Notes:**

1. **WorldScheduler** (`pixsim7_backend/services/simulation/scheduler.py`)
   - Implemented core scheduler class with `register_world()`, `unregister_world()`, `tick_world()` methods
   - `tick_world()` orchestrates the complete tick cycle:
     - Advances world time using timeScale
     - Selects NPCs for simulation (placeholder for Phase 21.4)
     - Simulates NPCs via behavior system (placeholder for Phase 21.4)
     - Enqueues generation jobs with backpressure (placeholder for Phase 21.5)
     - Progresses interaction chains (placeholder for Phase 21.6)
     - Persists world time periodically (every 10 ticks)
     - Tracks performance metrics
   - Maintains `_contexts` dict mapping world_id to WorldSimulationContext
   - Includes helper methods: `get_context()`, `get_all_contexts()`, `get_stats()`

2. **SchedulerLoopRunner** (`pixsim7_backend/services/simulation/scheduler.py`)
   - Runs the scheduler loop for all registered worlds
   - `run_once()` method ticks worlds that are due based on `tickIntervalSeconds`
   - `start()` method for continuous loop (dev/testing)
   - Tracks `_last_tick_times` per world to calculate delta_seconds
   - Error handling per-world to prevent one world from blocking others

3. **Deployment Options:**
   - **Dev/Local**: `SchedulerLoopRunner.start()` as background task in main app
   - **Production**: Dedicated worker process running the scheduler
   - **Distributed**: ARQ cron job calling `tick_all_worlds()` (placeholder added)
   - **Decision**: Start with ARQ cron job for consistency with existing worker architecture

4. **Integration Points (for future phases):**
   - Phase 21.4: `_select_npcs_for_simulation()` will use behavior system's tier logic
   - Phase 21.5: `_get_pending_generation_requests()` will query session flags
   - Phase 21.6: `_progress_interaction_chains()` will advance chains based on world_time

**Status:** ✅ Complete

---

## Phase 21.4 – NPC Simulation Loop Integration (Behavior + ECS)

**Goal**  
Make NPC simulation a first-class part of `tick_world`, using ECS and behavior system.

**Scope**

- Behavior simulation, ECS helpers, and simulation tiers.

**Key Steps**

1. Implement NPC selection per tier:
   - Use simulation tier config (from behavior system) + any world-level overrides.  
   - Respect `maxNpcTicksPerStep` across tiers.
2. For each NPC selected:
   - Use ECS helpers to:
     - Read `components["behavior"]`, `components["core"]`, `components["interactions"]`.  
   - Call into behavior system to:
     - Choose activity if `nextDecisionAt` has passed.  
     - Apply activity effects (which will update components & session flags).
3. Ensure behavior system:
   - Uses ECS + metric APIs exclusively (Task 19), not raw JSON.  
4. Make behavior simulation “step-based”:
   - Each tick only does a bounded amount of work (per config).

**Status:** ☐ Not started

---

## Phase 21.5 – Generation Queue & Backpressure Integration

**Goal**  
Tie generation job scheduling into the world scheduler so content generation doesn’t overwhelm the system.

**Scope**

- GenerationService and ARQ integration.

**Key Steps**

1. Define per-world and per-user generation limits:
   - Already partly present (`max_jobs_per_user`, ARQ config).  
   - Extend with world-level limits in `WorldSimulationConfig` if needed.
2. In `tick_world`:
   - After NPC simulation, compute how many generation ops are allowed this step (`maxJobOpsPerStep`).  
   - Enqueue generation jobs up to this limit (if any pending requests are in session flags/queues).  
3. Ensure generation result handling:
   - Job completion events update ECS components or flags appropriately (e.g., marking scenes as ready, interaction results).
4. Optionally:
   - Allow different worlds or shards to have different generation budgets.

**Status:** ☐ Not started

---

## Phase 21.6 – Interaction/Chain Cooldowns & Time-Based Logic

**Goal**  
Unify time-based logic in interaction chains, cooldowns, and NPC-initiated interactions under the scheduler’s world_time semantics.

**Scope**

- Interaction chain helpers, interaction cooldowns, pending NPC intents.

**Key Steps**

1. Ensure chain definitions:
   - Use world_time semantics for `waitSeconds/minutes/hours/days`.  
   - Store chain state in `components["interactions"]` for each NPC entity.
2. During `tick_world`:
   - Evaluate chains ready to advance based on world_time.  
   - Apply chain progression logic (e.g., mark steps complete, enqueue new interaction intents).
3. Cooldowns:
   - Use world_time and ECS `InteractionStateComponent` instead of mixing `time.time()` and world_time.  
4. NPC-initiated interactions:
   - Behavior hooks + chain progression can enqueue intents into ECS or session flags (as per Task 17).  
   - Scheduler ensures these intents are processed in a controlled, time-aware way.

**Status:** ☐ Not started

---

## Phase 21.7 – Observability, Limits, and Admin Controls

**Goal**  
Make the scheduler’s decisions visible and tunable at runtime.

**Scope**

- Logging, metrics, and admin APIs.

**Key Steps**

1. Logging:
   - Structured logs for each tick:
     - world_id, delta_game_seconds, npc_ticks, job_ops, tier distribution.  
2. Metrics:
   - Counters/gauges for:
     - NPC ticks per tier.  
     - Generation jobs started/completed per world.  
     - Scheduler latency per tick.  
3. Admin controls:
   - Endpoints to:
     - Adjust `WorldSimulationConfig` (timeScale, limits).  
     - Pause/resume simulation per world.  
     - Force a tick for a world (for debugging).
4. Dev tools:
   - A simple UI panel (later) showing:
     - Current world_time, active NPC counts per tier.  
     - Recent tick stats.

**Status:** ☐ Not started

---

## Success Criteria

By the end of this task:

- World/session time semantics are clear and consistent:
  - world_time is the standard for game-time logic.  
  - Real-time is used only where necessary (provider backoffs, auto-retry).
- NPC behavior simulation is explicitly orchestrated by a scheduler:
  - Per world, per tier, with clear limits on work per tick.  
  - Uses ECS and metric APIs for all state reads/writes.
- Generation jobs are scheduled with awareness of simulation load:
  - No uncontrolled spikes from behavior-triggered generations.  
  - Per-world and per-user budgets can be enforced.
- Interaction chains and cooldowns use the same time model as behavior:
  - No mix of ad-hoc `time.time()` and world_time for gameplay logic.
- The system is observable and tunable:
  - You can inspect and adjust simulation parameters without touching code.
  - It's clear how many NPCs and jobs are processed per tick in each world.

---

## Phase 21.1 Inventory Summary

### Time & Scheduling Usage Analysis

Below is a comprehensive inventory of all time-based and scheduling mechanisms currently in the codebase, categorized by time source.

| System | Time Source | Scheduling Mechanism | Location | Notes |
|--------|-------------|---------------------|----------|-------|
| **WORLD-TIME-DRIVEN** | | | | |
| GameSession world_time | `GameSession.world_time` field | Per-session game time tracker | `pixsim7_backend/domain/game/models.py:66` | Primary per-session world time (float seconds) |
| GameWorld world_time | `GameWorldState.world_time` field | Global world time tracker | `pixsim7_backend/domain/game/models.py:94` | Global world-level time, advanced via `advance_world_time()` |
| Behavior simulation ticking | `world_time` parameter | NPC state `next_tick_at` compared to world_time | `pixsim7_backend/domain/behavior/simulation.py:114-138` | Determines when NPCs should be simulated based on tier tickFrequencySeconds |
| NPC simulation tiers | Tier config | `tickFrequencySeconds` per tier (1s, 60s, 3600s) | `pixsim7_backend/domain/behavior/simulation.py:23-62` | high_priority=1s, medium_priority=60s, background=3600s |
| Interaction time-of-day | `world_time` parsed to hour | Time constraint evaluation (periods, hour_ranges) | `pixsim7_backend/domain/game/interaction_availability.py:42-119` | Parses world_time to week cycle, day, hour for gating |
| NPC schedules | `world_time` | day_of_week + start_time/end_time (seconds into day) | `pixsim7_backend/domain/game/models.py:124-132` | Activity windows based on world time cycles |
| Scene edge cooldowns | `cooldown_sec` field | Cooldown tracking per edge traversal | `pixsim7_backend/domain/game/models.py:48` | Time-based cooldown (currently unclear if world_time or real-time) |
| Activity cooldowns | Behavior activities | `cooldownSeconds` and `minDurationSeconds` | Behavior system (doc reference) | Prevents rapid activity switching |
| **REAL-TIME-DRIVEN** | | | | |
| Generation status polling | `datetime.utcnow()` | ARQ cron job every 10 seconds | `pixsim7_backend/workers/status_poller.py:25-220` | Polls provider APIs for generation status updates |
| Automation loops | `datetime.utcnow()` | ARQ cron job every 30 seconds | `pixsim7_backend/workers/arq_worker.py:95-100` | Runs automation loop executions |
| Worker heartbeat | `datetime.utcnow()` | ARQ cron job every 30 seconds | `pixsim7_backend/workers/arq_worker.py:101-106` | Health tracking for workers |
| Generation timeout | `datetime.utcnow()` | 2-hour timeout check in poller | `pixsim7_backend/workers/status_poller.py:60-85` | Fails generations stuck in PROCESSING > 2hrs |
| Generation scheduled_at | `Generation.scheduled_at` vs `datetime.utcnow()` | Check in job processor | `pixsim7_backend/workers/job_processor.py:109-113` | Defers generation processing until scheduled time |
| Provider account cooldown | `ProviderAccount.cooldown_until` vs `datetime.utcnow()` | Check in account selection | Account service | Rate limiting for provider accounts |
| Execution loop delays | `ExecutionLoop.last_execution_at` vs `datetime.utcnow()` | `delay_between_executions` check | `pixsim7_backend/services/automation/execution_loop_service.py:49-54` | Minimum time between automation executions |
| Daily execution limits | Daily counter reset | `executions_today` with daily limit | Automation execution loops | Resets at day boundary (real-time) |
| ARQ job processing | ARQ queue | Worker pulls jobs from Redis queue | `pixsim7_backend/workers/job_processor.py:41-92` | On-demand job processing via Redis |
| **MIXED/AMBIGUOUS** | | | | |
| Relationship lastInteractionAt | `datetime.utcnow().isoformat()` | Timestamp update on interaction | `pixsim7_backend/domain/game/interaction_execution.py:80` | **ISSUE:** Uses real-time, should use world_time |
| Session updated_at | `datetime.utcnow()` via `func.now()` | Auto-update on session changes | `pixsim7_backend/domain/game/models.py:69` | Audit/tracking timestamp (appropriate for real-time) |
| Interaction chain waits | Not fully implemented | waitSeconds/Minutes/Hours/Days mentioned in task doc | Task 21 context | **TODO:** Need to implement with world_time semantics |
| NPC memory timestamps | `datetime.utcnow()` | Memory creation/update tracking | NPC memory system | May need world_time for in-game memory formation |

### Key Findings

#### 1. **Dual World Time Systems**
- Both `GameSession.world_time` and `GameWorldState.world_time` exist
- Sessions can have independent world_time OR share world-level time
- **Decision needed:** Should world_time be per-world or per-session?

#### 2. **No Unified Simulation Loop**
- Behavior simulation references world_time but has no active scheduler
- No code actively calls `should_tick_npc()` or `update_next_tick_time()`
- NPC simulation appears to be reactive (on-demand) rather than scheduled

#### 3. **Generation System is Real-Time Only**
- Entirely driven by ARQ cron jobs and wall-clock time
- No integration with world_time or simulation budgets
- Can spike independently of game simulation load

#### 4. **Time Semantic Confusion**
- `lastInteractionAt` uses real-time but should probably use world_time for gameplay logic
- Cooldowns mix real-time and world-time concepts
- No clear documentation on when to use which time source

#### 5. **Missing Scheduler Integration**
- Behavior system has simulation tier logic but no orchestrator calling it
- No backpressure between NPC simulation and generation jobs
- No per-tick work budgets enforced anywhere

#### 6. **Periodic Task Isolation**
- Status poller (10s), automation loops (30s), heartbeat (30s) run independently
- No coordination with world simulation or tick timing
- Could cause CPU spikes if many systems trigger simultaneously

### Recommendations for Phases 21.2-21.7

1. **Unify world_time semantics** (Phase 21.2)
   - Decide: World-level vs session-level world_time
   - Default to world-level with optional session overrides

2. **Create WorldScheduler** (Phase 21.3)
   - Single source of truth for "what should run this tick"
   - Calls into behavior simulation, generation scheduling, chain progression
   - Respects work budgets (maxNpcTicksPerStep, maxJobOpsPerStep)

3. **Activate behavior simulation** (Phase 21.4)
   - Scheduler actively calls `get_npcs_to_simulate()` each tick
   - Integrates with ECS for state reads/writes
   - Respects tier configs and tick frequencies

4. **Integrate generation scheduling** (Phase 21.5)
   - Scheduler enqueues generation jobs with awareness of current load
   - Per-world and per-user generation budgets
   - Backpressure when too many jobs pending

5. **Standardize interaction timing** (Phase 21.6)
   - Convert `lastInteractionAt` to world_time
   - Implement chain wait logic using world_time
   - Unify cooldown semantics (world_time for gameplay, real-time for providers)

6. **Add observability** (Phase 21.7)
   - Log tick stats (NPCs simulated, jobs enqueued, tick duration)
   - Metrics per world (active NPCs per tier, generation queue depth)
   - Admin APIs to adjust simulation config at runtime

---

**Status:** ✅ Phase 21.1 Complete

