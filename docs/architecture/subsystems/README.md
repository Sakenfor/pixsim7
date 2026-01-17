# PixSim7 Subsystem Architecture Map

> **Purpose:** Neutral analysis of how each major subsystem is implemented across backend, frontend, and shared types. Documents source of truth, data flow, and intentional divergence patterns.
>
> **Last Updated:** 2026-01-05

## Overview

This document maps how each subsystem handles:
1. **Source of Truth** - Where canonical data/logic lives
2. **Validation/Contract** - Schemas and where they're enforced
3. **Data Flow** - API endpoints, clients, stores
4. **Runtime Authority** - Backend-only, frontend-only, or hybrid
5. **Extensibility** - Plugins, registries, config overrides
6. **Drift vs Intentional** - Duplicated logic and why

---

## Subsystems at a Glance

| Subsystem | Backend Authority | Frontend Role | Shared Types |
|-----------|------------------|---------------|--------------|
| **Stats** | Full (computation, derivation) | Read-only + preview API | `worldConfig.ts` (Zod) |
| **Automation** | Full (execution, scheduling) | UI + API wrapper | OpenAPI generated |
| **Game Engine** | Authoritative (effects, state) | Orchestration + caching | `game.ts`, `interactions.ts` |
| **Assets** | Storage + ingestion | Resolution + display | `assets-core`, `assetProvider.ts` |
| **Narrative** | Storage + context building | Execution + editing | `narrative.ts` |
| **Plugins** | Registration + permissions | Catalog display | `capabilities-core` |
| **Providers** | Execution + billing | UI plugins + settings | OpenAPI + manifests |
| **World Config** | Merge + ordering | Cache + fallback | `worldConfig.ts` |
| **Generation** | Job processing + billing | WebSocket + queuing | `generation-core` |
| **Gizmo Stats** | None (frontend-only) | Local computation | None (inline types) |
| **Entity Refs** | Shared parsing | Shared parsing | `ref-core` |

---

## 1. Stats Subsystem

### Architecture Table

| Aspect | Details |
|--------|---------|
| **Source of Truth** | Backend `StatPackageRegistry` (in-memory) + `GameWorld.meta.stats_config` (DB) |
| **Validation** | Backend: Pydantic (`schemas.py`). Frontend: Zod (`worldConfig.ts`) |
| **Data Flow** | `POST /api/v1/stats/preview-*` → `previewClient.ts` → `PixSim7Core` cache |
| **Runtime Authority** | **Backend-only** for tier/level computation, derivation |
| **Extensibility** | Stat packages registered at startup; world-level overrides in meta |
| **Drift** | Frontend has `getRelationshipTierOrder()` fallback—intentional degradation |

### Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Backend | `pixsim7/backend/main/domain/game/stats/engine.py` | Tier/level computation |
| Backend | `pixsim7/backend/main/domain/game/stats/derivation_engine.py` | Semantic derivation |
| Backend | `pixsim7/backend/main/domain/game/stats/package_registry.py` | Package discovery |
| Backend | `pixsim7/backend/main/api/v1/stat_preview.py` | Preview endpoints |
| Shared | `packages/shared/types/src/worldConfig.ts` | Canonical Zod schemas |
| Shared | `packages/shared/logic-core/src/stats/previewClient.ts` | API client |
| Frontend | `packages/game/engine/src/core/PixSim7Core.ts` | Brain state + caching |
| Frontend | `packages/game/engine/src/relationships/computation.ts` | State extraction |

### Data Flow

```
Backend Registry (startup)
    ↓
GET /game/worlds/{id}/config
    ↓ (merged definitions + pre-computed ordering)
worldConfigStore (frozen, immutable)
    ↓
POST /api/v1/stats/preview-derived-stats
    ↓ (what-if scenarios)
PixSim7Core.derivedStatsCache
    ↓
UI Components read cached values
```

---

## 2. Automation Subsystem

### Architecture Table

| Aspect | Details |
|--------|---------|
| **Source of Truth** | Backend DB: `AndroidDevice`, `AppActionPreset`, `ExecutionLoop`, `AutomationExecution` |
| **Validation** | Backend: Pydantic + `ActionSchema` registry. Frontend: Form-level |
| **Data Flow** | `POST /automation/*` → ARQ worker → `ActionExecutor` → ADB/UIA2 |
| **Runtime Authority** | **Backend-only** for execution; frontend is UI-only |
| **Extensibility** | `ActionSchema` registry drives dynamic UI; presets are user-created |
| **Drift** | None—frontend is pure UI consumer |

### Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Backend | `pixsim7/backend/main/domain/automation/preset.py` | Preset model |
| Backend | `pixsim7/backend/main/domain/automation/execution_loop.py` | Loop scheduling |
| Backend | `pixsim7/backend/main/services/automation/action_executor.py` | Action execution |
| Backend | `pixsim7/backend/main/services/automation/device_pool_service.py` | LRU device assignment |
| Backend | `pixsim7/backend/main/services/automation/execution_loop_service.py` | Loop processing |
| Backend | `pixsim7/backend/main/api/v1/automation.py` | API routes |
| Backend | `pixsim7/backend/main/workers/automation.py` | ARQ task |
| Frontend | `apps/main/src/features/automation/lib/core/automationService.ts` | API wrapper |
| Frontend | `apps/main/src/features/automation/components/ActionBuilder.tsx` | Action editor |

### Execution Flow

```
Frontend: POST /automation/execute-preset
    ↓
Backend: Create AutomationExecution (PENDING)
    ↓
ARQ Worker: process_automation task
    ↓
DevicePoolService: LRU device selection
    ↓
ActionExecutor: Execute actions (nested support)
    ↓
Update execution status → WebSocket event
```

---

## 3. Game Engine Subsystem

### Architecture Table

| Aspect | Details |
|--------|---------|
| **Source of Truth** | Backend `GameSession` (DB) + `PluginContext` for execution |
| **Validation** | Backend: Pydantic ECS schemas. Frontend: TypeScript interfaces |
| **Data Flow** | `POST /game_actions/execute` → effects applied → session returned → `GameRuntime` cache |
| **Runtime Authority** | **Hybrid**: Backend authoritative for effects; frontend runs narrative |
| **Extensibility** | Backend plugins via `PluginContext`; frontend `NodeHandlerRegistry` |
| **Drift** | `conditionEvaluator.ts` duplicates backend logic—**intentional** for local narrative |

### Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Backend | `pixsim7/backend/main/domain/game/core/game_state.py` | GameContext model |
| Backend | `pixsim7/backend/main/domain/game/core/ecs.py` | ECS component system |
| Backend | `pixsim7/backend/main/domain/game/interactions/interaction_execution.py` | Interaction handling |
| Backend | `pixsim7/backend/main/api/v1/npc_interactions.py` | Interaction API |
| Shared | `packages/shared/types/src/game.ts` | Game types |
| Shared | `packages/shared/types/src/interactions.ts` | Interaction types |
| Frontend | `packages/game/engine/src/core/PixSim7Core.ts` | Headless NPC state |
| Frontend | `packages/game/engine/src/runtime/GameRuntime.ts` | Session management |
| Frontend | `packages/game/engine/src/narrative/conditionEvaluator.ts` | Condition eval |
| Frontend | `packages/game/engine/src/narrative/effectApplicator.ts` | Effect application |
| Frontend | `apps/main/src/lib/game/runtime/useGameRuntime.ts` | React integration |

### Dual-Core Architecture

```
PixSim7Core (Headless)              GameRuntime (Interactive)
├── Brain state building            ├── Session loading/saving
├── Relationship state              ├── Interaction execution
├── Persona caching                 ├── Time advancement
└── Derived stats cache             └── Mode transitions
         ↓                                    ↓
    Read-only view                   Calls backend for effects
```

---

## 4. Assets Subsystem

### Architecture Table

| Aspect | Details |
|--------|---------|
| **Source of Truth** | Backend `Asset` model + content-addressed storage (`stored_key`) |
| **Validation** | Backend: Pydantic `AssetResponse`. Frontend: `AssetModel` transform |
| **Data Flow** | Upload → SHA256 dedup → storage → thumbnail → `GET /assets` → URL resolution |
| **Runtime Authority** | **Backend-only** for storage; frontend resolves URLs |
| **Extensibility** | Filter registry drives dynamic UI filters |
| **Drift** | None—frontend reads backend state |

### Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Backend | `pixsim7/backend/main/domain/assets/models.py` | Asset model |
| Backend | `pixsim7/backend/main/api/v1/assets.py` | Asset API |
| Backend | `pixsim7/backend/main/services/asset/ingestion.py` | Ingestion pipeline |
| Backend | `pixsim7/backend/main/services/storage/` | Content-addressed storage |
| Shared | `packages/shared/assets-core/src/` | Asset types + media type utils |
| Shared | `packages/shared/types/src/assetProvider.ts` | Provider interface |
| Frontend | `apps/main/src/features/assets/models/asset.ts` | Asset model |
| Frontend | `apps/main/src/lib/assetUrlResolver.ts` | URL resolution |
| Frontend | `apps/main/src/lib/assetProvider/` | Provider pattern |

### Ingestion Pipeline

```
Upload (file or URL)
    ↓
SHA256 hash computation (dedup check)
    ↓
Content-addressed storage (stored_key)
    ↓
Metadata extraction (dimensions, duration)
    ↓
Thumbnail generation (async)
    ↓
Asset record created
```

---

## 5. Narrative/Graph Subsystem

### Architecture Table

| Aspect | Details |
|--------|---------|
| **Source of Truth** | Backend: `NarrativeProgram` in world meta. Frontend: Redux stores for editing |
| **Validation** | Backend: Pydantic `schema.py`. Frontend: `validateArcGraph()` |
| **Data Flow** | Programs in `world.meta` → loaded by `NarrativeExecutor` (frontend) |
| **Runtime Authority** | **Hybrid**: Backend builds context; frontend executes story flow |
| **Extensibility** | `NodeHandlerRegistry` for custom nodes; Arc graph layers |
| **Drift** | `ConditionExpression` in both—**intentional** (different contexts) |

### Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Backend | `pixsim7/backend/main/domain/narrative/schema.py` | Pydantic models |
| Backend | `pixsim7/backend/main/domain/narrative/engine.py` | Context building |
| Backend | `pixsim7/backend/main/services/narrative/runtime.py` | Backend runtime |
| Shared | `packages/shared/types/src/narrative.ts` | Narrative types |
| Frontend | `packages/game/engine/src/narrative/executor.ts` | Story execution |
| Frontend | `packages/game/engine/src/narrative/nodeHandlers.ts` | Node handlers |
| Frontend | `apps/main/src/features/graph/stores/arcGraphStore/` | Arc graph state |
| Frontend | `apps/main/src/features/graph/models/arcGraph/validation.ts` | Graph validation |

### Node Type Hierarchy

```
NarrativeProgram
├── DialogueNode (static/template/llm_program)
├── ChoiceNode (conditional options)
├── ActionNode (apply effects)
├── ActionBlockNode (visual generation)
├── SceneTransitionNode (cross-scene)
├── BranchNode (auto-advance conditions)
├── WaitNode (duration/condition pause)
├── ExternalCallNode (plugin integration)
└── CommentNode (documentation)
```

---

## 6. Plugins/Providers Subsystem

### Architecture Table

| Aspect | Details |
|--------|---------|
| **Source of Truth** | Backend: `PluginManager` + `ProviderRegistry` (in-memory) |
| **Validation** | Backend: `PluginManifest` Pydantic + permission validation |
| **Data Flow** | Plugins discovered → registered → `PluginContext` at runtime |
| **Runtime Authority** | **Backend-only** for capability access; frontend displays catalog |
| **Extensibility** | `manifest.py` declares `provides`, `permissions` |
| **Drift** | None—frontend consumes backend registry |

### Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Backend | `pixsim7/backend/main/infrastructure/plugins/manager.py` | Plugin discovery |
| Backend | `pixsim7/backend/main/infrastructure/plugins/context.py` | PluginContext |
| Backend | `pixsim7/backend/main/infrastructure/plugins/permissions.py` | Permission system |
| Backend | `pixsim7/backend/main/infrastructure/plugins/behavior_registry.py` | Behavior extensions |
| Backend | `pixsim7/backend/main/domain/providers/registry/provider_registry.py` | Provider registry |
| Backend | `pixsim7/backend/main/services/provider/base.py` | Provider interface |
| Shared | `packages/shared/capabilities-core/src/` | Capability registry |
| Frontend | `apps/main/src/features/providers/lib/core/capabilityRegistry.ts` | Capability cache |
| Frontend | `apps/main/src/features/providers/lib/core/generationPlugins.ts` | UI plugins |

### Plugin Permission Model

```
PluginManifest declares:
├── kind: route | feature | behavior | stats | ...
├── provides: [api_routes, behavior_conditions, ...]
├── permissions: [session:read, npc:write, ...]
└── depends_on: [other_plugin_ids]

At runtime:
PluginContext gates access based on declared permissions
```

---

## 7. World Configuration Subsystem

### Architecture Table

| Aspect | Details |
|--------|---------|
| **Source of Truth** | Backend: `StatPackageRegistry` + `GameWorld.meta` merge |
| **Validation** | Backend: Pydantic. Frontend: Zod with defaults fallback |
| **Data Flow** | `GET /game/worlds/{id}/config` → `worldConfigStore` (frozen) |
| **Runtime Authority** | **Backend** computes `tier_order`, `level_order` |
| **Extensibility** | Plugin configs via `plugin:*` keys in meta |
| **Drift** | Frontend has `parseStatsConfig()` fallback via logic-core—**intentional** safe degradation |

### Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Backend | `pixsim7/backend/main/api/v1/game_worlds.py:995-1028` | Config endpoint |
| Backend | `pixsim7/backend/main/domain/game/stats/package_registry.py` | Merge logic |
| Shared | `packages/shared/types/src/worldConfig.ts` | Zod schemas + defaults |
| Frontend | `apps/main/src/stores/worldConfigStore.ts` | Config store |
| Frontend | `apps/main/src/hooks/useWorldConfig.ts` | React hooks |

### Two-Level Override System

```
Layer 0: StatPackageRegistry (base definitions)
    ↓ merge
Layer 1: GameWorld.meta["stats_config"] (world overrides)
    ↓ validate + compute ordering
WorldConfigResponse (returned to frontend)
    ↓ freeze
worldConfigStore (immutable cache)
```

---

## 8. Generation Subsystem

### Architecture Table

| Aspect | Details |
|--------|---------|
| **Source of Truth** | Backend `Generation` model + `ProviderSubmission` tracking |
| **Validation** | Backend: Pydantic. Frontend: form validation |
| **Data Flow** | `POST /generations` → ARQ → provider → polling → WebSocket |
| **Runtime Authority** | **Backend-only** for execution; frontend receives events |
| **Extensibility** | Provider adapters; frontend `generationUIPluginRegistry` |
| **Drift** | None—frontend is event consumer only |

### Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Backend | `pixsim7/backend/main/domain/generation/models.py` | Generation model |
| Backend | `pixsim7/backend/main/api/v1/generations.py` | API routes |
| Backend | `pixsim7/backend/main/services/generation/creation.py` | Creation service |
| Backend | `pixsim7/backend/main/services/generation/lifecycle.py` | Status transitions |
| Backend | `pixsim7/backend/main/workers/job_processor.py` | ARQ processor |
| Backend | `pixsim7/backend/main/services/provider/adapters/pixverse.py` | Pixverse adapter |
| Shared | `packages/shared/generation-core/src/` | Generation types |
| Frontend | `apps/main/src/features/generation/hooks/useGenerationWebSocket.ts` | Real-time updates |
| Frontend | `apps/main/src/features/generation/stores/generationsStore.ts` | Generation state |
| Frontend | `apps/main/src/features/generation/lib/quickGenerateLogic.ts` | Request building |

### Generation Lifecycle

```
POST /generations (create)
    ↓
ARQ job queued
    ↓
Worker: select account, charge credits
    ↓
Provider API call (execute)
    ↓
Status polling loop
    ↓
On completion: create Asset, emit event
    ↓
WebSocket: job:completed → frontend store update
```

---

## 9. Gizmo Interaction Stats (Frontend-Only)

### Architecture Table

| Aspect | Details |
|--------|---------|
| **Source of Truth** | Frontend local state only |
| **Validation** | TypeScript interfaces |
| **Data Flow** | Tool interaction → `calculateStatChanges()` → local stat accumulator |
| **Runtime Authority** | **Frontend-only** - not persisted to backend |
| **Extensibility** | Custom stats via `StatContribution[]`, zone modifiers |
| **Drift** | N/A - standalone local system |

### Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Frontend | `apps/main/src/features/gizmos/lib/core/interactionStats.ts` | Stat types + calculation |

### Purpose

Local interaction feedback system for tool-based gameplay (e.g., tickle, pleasure, arousal stats). Stats accumulate based on tool type, zone sensitivity, and decay over time. **Not related to the backend Stats subsystem** - this is purely for real-time UI feedback.

---

## 10. Entity Refs (Shared)

### Architecture Table

| Aspect | Details |
|--------|---------|
| **Source of Truth** | Shared package (`@pixsim7/shared.ref.core`) |
| **Validation** | Zod schemas + type guards |
| **Data Flow** | Both backend and frontend import from shared package |
| **Runtime Authority** | **Shared** - pure parsing/building utilities |
| **Extensibility** | Ref patterns: `npc:`, `loc:`, `scene:`, `asset:`, etc. |
| **Drift** | None - single source in shared package |

### Key Files

| Layer | File | Purpose |
|-------|------|---------|
| Shared | `packages/shared/ref-core/src/index.ts` | Ref builders, parsers, guards |

---

## Drift vs Intentional Divergence

| Subsystem | Pattern | Reason |
|-----------|---------|--------|
| **Stats** | Frontend fallback computation | Graceful degradation if API unavailable (helpers in `shared.logic-core`) |
| **Game Engine** | Condition evaluator duplication | Backend: interaction gating. Frontend: narrative flow |
| **Narrative** | ConditionExpression in both | Same logic, different execution contexts |
| **World Config** | Zod parsing with defaults | Safe degradation; never crash on bad config (parsers in `shared.logic-core`) |
| **Assets** | None | Pure read pattern |
| **Automation** | None | Pure UI pattern |
| **Generation** | None | Event-driven pattern |
| **Gizmo Stats** | N/A | Frontend-only, not shared |
| **Entity Refs** | None | Single shared package |

---

## Low-Churn Alignment Opportunities

> **Note:** These are observations, not recommendations for immediate action.

### 1. Unify Condition Expression Parsing

**Current State:**
- Backend: `pixsim7/backend/main/domain/narrative/programs.py`
- Frontend: `packages/game/engine/src/narrative/conditionEvaluator.ts`

**Opportunity:** Extract to `packages/shared/condition-core` with single parser, imported by both layers.

**Risk:** Low—expression grammar is stable.

---

### 2. Consolidate Tier/Level Ordering Logic

**Current State:**
- Backend computes in `package_registry.py:400-455`
- Frontend has fallback in `@pixsim7/shared.logic-core/stats:getRelationshipTierOrder()`

**Opportunity:** Always require backend ordering; remove frontend fallback.

**Risk:** Medium—requires ensuring config endpoint is always called first.

---

### 3. Shared ActionSchema Type Package

**Current State:**
- Backend defines in `action_schemas.py`
- Frontend consumes via OpenAPI types

**Opportunity:** Create `@pixsim7/automation-schemas` with TypeScript + Python codegen.

**Risk:** Low—schemas are stable.

---

### 4. Unify Asset URL Resolution

**Current State:**
- Backend computes URLs in `AssetResponse`
- Frontend has `assetUrlResolver.ts` with preference logic

**Opportunity:** Backend returns resolved URLs based on user preference (query param).

**Risk:** Low—reduces frontend complexity.

---

### 5. Extract ECS Component Types

**Current State:**
- Backend: `pixsim7/backend/main/domain/game/schemas/components.py`
- Frontend: `packages/game/engine/src/core/types.ts`

**Opportunity:** Single source in `@pixsim7/ecs-types` with codegen for both languages.

**Risk:** Medium—requires build pipeline changes.

---

## Summary

The codebase follows a **backend-authoritative** pattern with clear separation:

| Layer | Role |
|-------|------|
| **Backend** | Source of truth for all state, computation, and effects |
| **Shared Types** | Canonical schemas (Zod/Pydantic parity) for validation |
| **Frontend** | UI orchestration, caching, local preview, event consumption |

**Intentional duplication** exists only where:
1. Frontend needs offline/degraded capability (world config parsing)
2. Different execution contexts require same logic (condition evaluation)
3. Performance requires local caching (brain state, derived stats)
