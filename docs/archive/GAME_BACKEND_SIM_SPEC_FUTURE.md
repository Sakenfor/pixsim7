# ⚠️ DEPRECATED / FUTURE SPECIFICATION - NOT CURRENT IMPLEMENTATION

> **Status:** ARCHIVED
> **Date:** 2025-11-16
> **Reason:** This spec describes a tick-based simulation engine for a separate `pixsim7_game_service` microservice. Game logic was **consolidated into the main backend** (`pixsim7/backend/main/domain/game/`) instead.

---

## For Current Game Implementation, See:

**Current architecture (implemented):**
- `docs/SYSTEM_OVERVIEW.md` – High-level overview of current game systems
- `docs/RELATIONSHIPS_AND_ARCS.md` – How relationships/arcs work in current implementation
- `pixsim7/backend/main/domain/game/README.md` – Current game domain architecture
- Current entities: `GameWorld`, `GameSession`, `GameNPC`, `GameLocation`, `GameHotspot`, `GameScene`

**Current design:**
- Request-based (not tick-based)
- Session-driven with `world_time` field (not simulation ticks)
- JSON-based `flags` and `relationships` (not separate tables for quests/events)
- Consolidated into main backend (not separate service)

---

## This Document Describes (Not Implemented):

A **future tick-based simulation architecture** that could be implemented if needed for more complex life-sim features. Key differences from current implementation:

| Future Spec (This Doc) | Current Implementation |
|------------------------|------------------------|
| `Character` entity | `GameNPC` + `GameSession.relationships` |
| `WorldState` entity | `GameWorldState` + `GameSession.flags` |
| Tick-based engine | Request-based with `world_time` field |
| Utility AI / GOAP | Frontend-driven scene graphs |
| Separate `pixsim7_game_service` | Consolidated in `pixsim7/backend/main/domain/game/` |
| Dedicated events/quests tables | `GameSession.flags` conventions |

**If you need to implement tick-based simulation in the future, this spec can serve as a starting point.**

---

## Original Spec Below (Aspirational):

## Game Backend Simulation: Characters, Day/Night Cycles, Events, Personalities

Audience: Claude Opus. Objective: Implement a deterministic, extensible life-sim backend in `pixsim7_game_service` with characters, schedules, personalities, relationships, events, and a time engine. Keep modules small, testable, and documented. Start minimal but with strong architecture for growth.

---
## 1) Goals and Non-Goals

Goals
- Deterministic simulation ticks (seeded RNG) with configurable time scale (e.g., 1 tick = 1 minute).
- Characters with personality traits, needs, skills, and schedules that drive behavior.
- Event system: triggers/conditions/effects, local (per character/location) and global.
- Relationships and factions affecting choices and event outcomes.
- Simple economy scaffold (money, prices, wages) to influence activities.
- Queryable via HTTP + live updates via WebSocket (or Server-Sent Events fallback).

Non-Goals (Phase 1)
- Graphics/gameplay client. We focus on backend simulation and clean API.
- Pathfinding/spatial simulation; locations are logical nodes with capacity and hours.
- Combat/physics; treat as future modules.

---
## 2) High-Level Architecture

Core packages (in `pixsim7_game_service`):
- domain/
  - entities.py: Character, Relationship, Location, Faction, Item, Activity, EventTemplate, EventInstance, WorldState
  - enums.py: Trait types, Need types, Skill types, Activity types
  - time.py: Calendar/Clock, Tick, DayPeriod (Morning/Day/Evening/Night)
- sim/
  - engine.py: main tick loop, scheduler, event queue
  - planning.py: utility AI or GOAP-lite for activity selection
  - events.py: trigger evaluation, condition checking, effects application
  - rng.py: seeded RNG utilities (per world and scoped per character)
- data/
  - presets/: YAML/JSON seeds (traits, activities, items, event templates)
- api/
  - routes.py: REST endpoints
  - ws.py (optional): websocket channel for tick+event stream
- services/
  - world_service.py: create/load world, advance ticks, mutate state safely
  - character_service.py: create/update character, relationships
- infrastructure/
  - persistence.py: repo interfaces; in-memory and SQLAlchemy implementations

Runtime contract
- A single world instance per server (Phase 1). Later: multi-worlds.
- Engine advances by tick (manual or auto). Effects are applied atomically per tick.

---
## 3) Time & Ticks

Time model
- Tick granularity: 1 minute (configurable). 1440 ticks/day.
- Day/night periods computed from hour; opening hours on locations.

Advancement modes
- Manual: POST /sim/tick?count=N
- Auto: background task at real-time pace (scale factor), pausable.

Determinism
- Use a WorldRNG(seed) for global; derive CharacterRNG via split(seed, character_id).
- All random decisions draw from RNG injected via context passed to planners/events.

---
## 4) Characters

State
- Traits (Big Five-like): openness, conscientiousness, extraversion, agreeableness, neuroticism (0–100).
- Needs: hunger, energy, hygiene, social, fun (0–100, where low triggers behavior).
- Skills: cooking, crafting, charisma, fitness, work_skill (0–100).
- Mood: computed from needs + recent events (bounded [-100,100]).
- Relationships: directed weights toward other characters (-100..100), plus tags (friend, rival, coworker).
- Inventory and money.
- Schedule preferences: soft bands for sleep/work/leisure.

Behavior selection (Utility AI)
- Activities compute a utility score: f(traits, needs, mood, timeOfDay, location availability, relationships, money).
- Choose max-utility feasible activity each tick (or hold current activity for duration).
- Activities have preconditions and effects (needs deltas, money, skill gains, relationship adjustments).

Examples
- Sleep at Night: high if energy < 30 and time in [22:00–06:00].
- Work (if employed): high if weekday and [09:00–17:00].
- Eat: high if hunger < 40 and has money or food.
- Socialize: extraversion boosts score; needs.social low increases score.

---
## 5) Locations & Factions

Location
- name, capacity, open_hours, tags (home, workplace, cafe, gym), prices (menu), faction owner.

Faction
- name, reputation per character, relationships with other factions.
- Event hooks (festival day increases socialize utility and shop discounts).

---
## 6) Events System

EventTemplate
- id, scope (global|location|character), triggers (time, need thresholds, relationship status), conditions (boolean), effects, cooldown, weight.
- YAML/JSON driven; loaded at startup (hot-reload in dev).

EventInstance
- materialized from template when triggered; applied on tick end or immediate.

Effects DSL (examples)
- needs.hunger += -20
- money += -price('meal')
- relationship[target]+= +5
- add_item('coffee')
- schedule_activity('gym', duration=60)

Conflict resolution
- Per tick, collect candidate events; sort by priority; apply until side constraints satisfied (e.g., location capacity).

---
## 7) Economy (Scaffold)

- Price lists by location; wages for work activities.
- Budget constraints enter utility; e.g., if money < cheap_meal, reduce Eat-out utility, increase Cook-at-home.

---
## 8) API Design (FastAPI)

REST
- GET /world: time, day, summary stats
- POST /sim/tick?count=N: advance simulation deterministically
- POST /sim/auto/start|stop|status: control auto loop
- GET /characters?limit&offset: list
- POST /characters: create with seed traits
- GET /characters/{id}: details (needs, traits, mood, schedule, current activity)
- POST /characters/{id}/nudge: set temporary bias or schedule override
- GET /events/recent?sinceTick: recent applied events

WebSocket (optional Phase 1)
- /ws: stream {tick, changedEntities, events}

---
## 9) Persistence & Determinism

- Phase 1: In-memory world with snapshot/restore endpoints (serialize to JSON via pydantic models).
- Phase 2: SQLAlchemy persistence (worlds, characters, relationships, events log). Ensure RNG state saved.
- Provide /world/snapshot export + /world/restore import.

---
## 10) Testing Strategy

- Unit tests: utility functions (time bands, needs decay), event condition evaluation.
- Property tests: invariants (needs in 0..100, money non-negative unless debt feature enabled).
- Determinism tests: same seed + same commands → same sequence of activities/events.
- Scenario tests: simulate 24h with 20 NPCs, assert distributions (sleep ≥ 6h, work on weekdays if employed, hunger never < 5 for > 2h).

---
## 11) Performance

- Target 10k ticks/sec for 100 NPCs in headless test (no IO) on a mid-range machine.
- Use vectorized updates where trivial (needs decay). Avoid per-tick DB writes; batch logs.
- Event evaluation short-circuit: index events by trigger type to reduce checks.

---
## 12) Implementation Plan (Phases)

Phase 1 (MVP)
- Time engine, seeded RNG
- Character core (traits, needs, schedule bands)
- Utility-based activity selection for Sleep/Work/Eat/Socialize/Idle
- Locations with open hours & capacity
- Minimal events: meal discount, random meetup, bonus wage day
- REST: tick, world, characters (list/detail/create)
- Tests: determinism + basic invariants

Phase 2
- Relationships graphs influencing activities and events
- Factions and reputation
- Economy tuning; wages/prices variability per location
- Nudge API and schedule overrides
- Snapshot/restore

Phase 3
- WebSocket streaming updates
- Advanced events DSL (chained events, cooldowns per character)
- SQL persistence
- Performance pass and profiling hooks

---
## 13) Deliverables & Acceptance Criteria

Deliverables
- New modules under `pixsim7_game_service/{domain,sim,api,services}` with docstrings.
- Data presets in `pixsim7_game_service/data/presets` (YAML/JSON) for activities and events.
- Tests under `pixsim7_game_service/tests` with deterministic seeds and scenario suites.
- README updates: running simulation, API examples, testing.

Acceptance Criteria
- Deterministic behavior for same seed and command sequence.
- 24h simulation with 20 NPCs runs under 2 seconds headless (ballpark, document machine).
- API contracts as specified; OpenAPI updated.
- Tests green locally; at least 15 meaningful tests (units + scenarios).

---
## 14) Small Contracts (to anchor code)

Engine
```python
class SimEngine:
    def __init__(self, world: WorldState, rng: WorldRNG, tick_ms: int = 60000): ...
    def step(self, ticks: int = 1) -> list[EventInstance]: ...
```

Planner
```python
class Planner:
    def choose_activity(self, character: Character, ctx: SimContext) -> Activity | None: ...
```

Events
```python
class EventTemplate(BaseModel):
    id: str
    scope: Literal['global','location','character']
    triggers: list[Trigger]
    conditions: list[Condition]
    effects: list[Effect]
    weight: float = 1.0
    cooldown_ticks: int = 0
```

API
```http
POST /sim/tick?count=60 -> { tick, events_applied, changes }
GET  /characters/{id}    -> { traits, needs, mood, activity, location }
```

---
## 15) Notes

- Keep functions pure where possible; pass SimContext rather than pulling globals.
- Prefer pydantic models for external boundary; dataclasses fine internally if faster.
- Document assumptions and constants (needs decay rates, activity durations) in one config module.

---
End of spec.
