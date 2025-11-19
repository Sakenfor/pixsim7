**Task: Relationship Preview API & Metric-Based Derivations (Multi‑Phase)**

**Context**
- Today, relationship tiers and intimacy levels are computed:
  - **Backend (Python)** in `pixsim7_backend/domain/narrative/relationships.py` using world schemas.
  - **Game-core (TS)** in `packages/game-core/src/relationships/computation.ts` as a mirrored fallback.
- Frontend now imports only from game-core, but there is still **duplicated logic** between backend and TS.
- We want:
  - Backend to be the **only authority** for relationship calculations that affect persisted state.
  - A small, **backend‑powered “preview API”** that editors/tools can call to see “what would this tier/intimacy be?”.
  - A **metric‑based pattern** that can later handle other derived social/sim values (e.g. NPC mood, reputation bands) without adding more TS math.

Below are 10 phases for killing the TS fallback logic and introducing a reusable preview API/metric system.

> **For agents:** This task affects both backend and game-core. Keep the layering strict: backend = authority, game-core = typed accessors + preview wrappers, frontend = pure consumer. Update the checklist and add notes (files/PR/date) as phases land.

### Phase Checklist

- [x] **Phase 1 – Audit Current Relationship Computation & Call Sites** ✅ *2025-11-19*
- [x] **Phase 2 – Design Preview API & Metric Abstraction** ✅ *2025-11-19*
- [x] **Phase 3 – Implement Backend Relationship Preview Endpoint(s)** ✅ *2025-11-19*
- [x] **Phase 4 – Add Game-Core TS Wrappers & Types** ✅ *2025-11-19*
- [x] **Phase 5 – Migrate Editor/Tooling to Preview API** ✅ *2025-11-19* (No migration needed)
- [ ] **Phase 6 – Remove TS Fallback Logic for Relationships**
- [ ] **Phase 7 – Generalize Metric System for Future Social/Sim Derivations**
- [ ] **Phase 8 – Documentation & App Map Updates**
- [ ] **Phase 9 – Regression & Behavior Validation**
- [ ] **Phase 10 – Optional Offline Tooling Strategy**

---

### Phase 1 – Audit Current Relationship Computation & Call Sites

**Goal**
Get a precise picture of where relationship math lives and how it's used, to scope the change safely.

**Scope**
- Backend and game-core relationship computations.
- All TS call sites that depend on `compute_relationship_tier` / `compute_intimacy_level`.

**Key Steps**
1. Backend:
   - Confirm current logic in:
     - `pixsim7_backend/domain/narrative/relationships.py`
     - Any services calling `compute_relationship_tier` / `compute_intimacy_level` (e.g. `game_session_service.py`).
   - Note how world schemas are passed (e.g. `relationship_schemas`, `intimacy_schema`).
2. Game-core:
   - Identify all imports of `compute_relationship_tier`, `compute_intimacy_level`, and `extract_relationship_values` in:
     - `packages/game-core/src/relationships/computation.ts`
     - `session/state.ts`, `PixSim7Core`, tests, and any other files.
3. Frontend:
   - Confirm that frontend only calls relationship helpers through game-core (no stray copies).
4. Produce a short summary in this file (or a small dev note) listing:
   - "Authoritative computation: backend functions X/Y."
   - "TS depends on these functions at call sites A/B for previews/editor only."

---

**Phase 1 Audit Summary** ✅ *Completed 2025-11-19*

**Authoritative Backend Functions:**
- `pixsim7_backend/domain/narrative/relationships.py`:
  - `compute_relationship_tier(affinity, relationship_schemas, schema_key="default")` → Returns tier ID (e.g., "friend", "lover")
  - `compute_intimacy_level(relationship_values, intimacy_schema)` → Returns intimacy level ID (e.g., "intimate", "light_flirt")
  - `extract_relationship_values(relationships_data, npc_id)` → Returns tuple (affinity, trust, chemistry, tension, flags)
  - Helper: `_default_relationship_tier(affinity)` - Hardcoded fallback tiers
  - Helper: `_default_intimacy_level(relationship_values)` - Hardcoded fallback intimacy
  - Helper: `merge_npc_persona(base_personality, world_overrides)` - Persona merging

**Backend Call Sites:**
1. `pixsim7_backend/services/game/game_session_service.py:111-115`
   - `_normalize_session_relationships()` method
   - Computes and stores `tierId` and `intimacyLevelId` in GameSession.relationships
   - Currently uses empty schemas (TODO comment notes need to fetch world metadata)
   - Uses Redis cache with 60s TTL

2. `pixsim7_backend/domain/narrative/engine.py:116-120`
   - NarrativeEngine relationship computation
   - Used during dialogue/narrative evaluation
   - Passes `relationship_schemas` and `intimacy_schema` from world context

3. `pixsim7_backend/api/v1/game_dialogue.py:1008`
   - Dialogue API endpoint computation (imported but usage context not fully examined)

4. `pixsim7_backend/plugins/game_dialogue/manifest.py:604`
   - Plugin manifest using intimacy_schema from world.meta

**Schema Passing Pattern:**
- World schemas stored in `GameWorld.meta`:
  - `relationship_schemas`: Dict[str, list of tier definitions] - keyed by schema name (e.g., "default")
  - `intimacy_schema`: Dict with "levels" array
- Context object `NarrativeContext` (in `domain/narrative/context.py:58-59`) carries:
  - `relationship_schemas: Dict[str, Any]`
  - `intimacy_schema: Optional[Dict[str, Any]]`
- Fallback: If schemas missing/invalid, uses hardcoded defaults

**TS Mirror Implementation:**
- `packages/game-core/src/relationships/computation.ts`:
  - `compute_relationship_tier(affinity)` → Only implements hardcoded default tiers (no schema support!)
  - `compute_intimacy_level(relationshipValues)` → Only implements hardcoded default levels (no schema support!)
  - `extract_relationship_values(relationshipsData, npcId)` → Returns [affinity, trust, chemistry, tension, flags]
  - **CRITICAL GAP**: TS functions do NOT support world schemas, only hardcoded defaults

**Game-Core Call Sites:**
1. `packages/game-core/src/core/PixSim7Core.ts:110-125`
   - `getNpcRelationship()` method
   - Extracts values with `extract_relationship_values`
   - **Falls back** to TS computation if `tierId`/`intimacyLevelId` not present in session
   - Uses: `compute_relationship_tier(affinity)` and `compute_intimacy_level({...})`

2. `packages/game-core/src/session/state.ts:25-27`
   - Imports all three functions
   - Used for session state transformations (usage context: TBD from further code review)

3. `packages/game-core/src/index.ts:24-27`
   - Public API exports

4. `packages/game-core/src/__tests__/core-logic.test.ts:29-31, 133-135, 253-256, 271-283`
   - Test coverage for all three functions
   - Tests verify hardcoded tier/intimacy thresholds

**Frontend Call Sites:**
- `frontend/src/lib/game/relationshipComputation.ts`
  - **Re-exports only** from `@pixsim7/game-core` (no local implementation)
  - Acts as a thin facade for backward compatibility

- Frontend components import from game-core, not directly from relationshipComputation
  - 20+ files import `@pixsim7/game-core` but most use other helpers
  - No stray copies of relationship logic found in frontend

**Key Findings:**
1. **Duplication Confirmed**: Backend has schema-aware logic; TS only has hardcoded defaults
2. **Schema Gap**: TS cannot compute correct tiers/intimacy for worlds with custom schemas
3. **Runtime Authority**: Backend correctly normalizes relationships in `_normalize_session_relationships`
4. **Fallback Pattern**: PixSim7Core falls back to TS computation when backend values missing
5. **No Frontend Duplication**: Frontend correctly delegates to game-core only
6. **Test Coverage**: Both backend and TS have test coverage, but TS tests only cover defaults

**Risks & Scope Notes:**
- PixSim7Core's fallback creates a **correctness risk** when:
  - Sessions haven't been normalized by backend
  - Custom world schemas are in use
  - Editor/preview tools compute labels locally
- Removing TS logic will break:
  - PixSim7Core.getNpcRelationship() fallback path
  - Any offline/editor tools that compute labels without hitting backend
  - Tests that assert hardcoded tier/intimacy thresholds

---

### Phase 2 – Design Preview API & Metric Abstraction

**Goal**
Define a small, extensible API on the backend for relationship previews and future social/sim metrics.

**Scope**
- API shape and JSON payload/response formats.
- A generic "metric" pattern that can support more than relationships later.

**Key Steps**
1. Decide on API structure, e.g. either:
   - Separate endpoints:
     - `POST /api/v1/game/relationships/preview-tier`
     - `POST /api/v1/game/relationships/preview-intimacy`
   - Or a generic endpoint:
     - `POST /api/v1/game/preview` with:
       ```jsonc
       {
         "world_id": 1,
         "metric": "relationship_tier" | "relationship_intimacy",
         "payload": { ... }
       }
       ```
2. For relationships, specify request/response contracts, e.g.:
   - Tier preview:
     ```jsonc
     // Request
     {
       "world_id": 1,
       "affinity": 72.0
     }
     // Response
     {
       "tier_id": "close_friend",
       "schema_key": "default"
     }
     ```
   - Intimacy preview:
     ```jsonc
     {
       "world_id": 1,
       "relationship_values": {
         "affinity": 72.0,
         "trust": 40.0,
         "chemistry": 65.0,
         "tension": 20.0
       }
     }
     ```
3. Define a minimal abstraction for future metrics (e.g. `metric: string`, `payload: object`) so:
   - Relationship preview is the first metric.
   - Future metrics (e.g. `"npc_mood"`, `"reputation_band"`) are easy to add.

---

**Phase 2 Design Document** ✅ *Completed 2025-11-19*

**Decision: Hybrid Approach**

We'll use **specific endpoints** for relationships (better API discoverability) while designing the **internal implementation** to support a generic metric pattern (easier to extend later).

**API Endpoints:**

```
POST /api/v1/game/relationships/preview-tier
POST /api/v1/game/relationships/preview-intimacy
```

Future metrics can add their own endpoints (e.g., `/api/v1/game/npc/preview-mood`) while sharing the same internal metric evaluation infrastructure.

---

**API Contracts:**

**1. Preview Relationship Tier**

```http
POST /api/v1/game/relationships/preview-tier
Content-Type: application/json
```

Request:
```typescript
{
  "world_id": number;        // Required: World ID for schema lookup
  "affinity": number;        // Required: Affinity value (0-100 typical range)
  "schema_key"?: string;     // Optional: Schema to use (default: "default")
}
```

Response (200 OK):
```typescript
{
  "tier_id": string | null;  // Computed tier ID (e.g., "friend", "lover") or null
  "schema_key": string;      // Schema that was used
  "affinity": number;        // Echo of input value for verification
}
```

Error Response (404):
```typescript
{
  "error": "World not found",
  "world_id": number
}
```

Error Response (400):
```typescript
{
  "error": "Invalid request",
  "details": string
}
```

**2. Preview Intimacy Level**

```http
POST /api/v1/game/relationships/preview-intimacy
Content-Type: application/json
```

Request:
```typescript
{
  "world_id": number;        // Required: World ID for schema lookup
  "relationship_values": {   // Required: All relationship axes
    "affinity": number;      // 0-100 typical
    "trust": number;         // 0-100 typical
    "chemistry": number;     // 0-100 typical
    "tension": number;       // 0-100 typical
  }
}
```

Response (200 OK):
```typescript
{
  "intimacy_level_id": string | null;  // Computed intimacy level (e.g., "intimate", "light_flirt") or null
  "relationship_values": {             // Echo of input values for verification
    "affinity": number;
    "trust": number;
    "chemistry": number;
    "tension": number;
  }
}
```

Error Response (404):
```typescript
{
  "error": "World not found",
  "world_id": number
}
```

Error Response (400):
```typescript
{
  "error": "Invalid request",
  "details": string
}
```

---

**Internal Metric Abstraction (Backend)**

To support future metrics without code duplication, we'll use an internal **metric evaluator pattern**:

**Python Type Definitions:**

```python
# pixsim7_backend/domain/metrics/types.py

from typing import TypedDict, Any, Optional, Protocol
from enum import Enum

class MetricType(str, Enum):
    """Supported metric types for preview/evaluation."""
    RELATIONSHIP_TIER = "relationship_tier"
    RELATIONSHIP_INTIMACY = "relationship_intimacy"
    # Future:
    # NPC_MOOD = "npc_mood"
    # REPUTATION_BAND = "reputation_band"

class MetricRequest(TypedDict):
    """Generic metric evaluation request."""
    world_id: int
    metric: MetricType
    payload: dict[str, Any]

class MetricResponse(TypedDict):
    """Generic metric evaluation response."""
    metric: MetricType
    result: Any
    metadata: dict[str, Any]

class MetricEvaluator(Protocol):
    """Protocol for metric evaluator functions."""
    async def evaluate(
        self,
        world_id: int,
        payload: dict[str, Any],
        db: AsyncSession
    ) -> dict[str, Any]:
        """
        Evaluate a metric for a given world and input payload.

        Returns a dict with metric-specific result structure.
        Raises ValueError for invalid inputs.
        Raises NotFoundError if world doesn't exist.
        """
        ...
```

**Metric Registry:**

```python
# pixsim7_backend/domain/metrics/registry.py

from typing import Dict, Callable, Any
from .types import MetricType, MetricEvaluator

class MetricRegistry:
    """Registry of available metric evaluators."""

    def __init__(self):
        self._evaluators: Dict[MetricType, MetricEvaluator] = {}

    def register(self, metric_type: MetricType, evaluator: MetricEvaluator):
        """Register an evaluator for a metric type."""
        self._evaluators[metric_type] = evaluator

    def get_evaluator(self, metric_type: MetricType) -> MetricEvaluator:
        """Get evaluator for a metric type."""
        if metric_type not in self._evaluators:
            raise ValueError(f"Unknown metric type: {metric_type}")
        return self._evaluators[metric_type]

    def list_metrics(self) -> list[MetricType]:
        """List all registered metric types."""
        return list(self._evaluators.keys())

# Global registry instance
_registry = MetricRegistry()

def get_metric_registry() -> MetricRegistry:
    """Get the global metric registry."""
    return _registry
```

**Relationship Metric Evaluators:**

```python
# pixsim7_backend/domain/metrics/relationship_evaluators.py

from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7_backend.domain.game.models import GameWorld
from pixsim7_backend.domain.narrative.relationships import (
    compute_relationship_tier,
    compute_intimacy_level
)

async def evaluate_relationship_tier(
    world_id: int,
    payload: dict[str, Any],
    db: AsyncSession
) -> dict[str, Any]:
    """Evaluate relationship tier metric."""
    # Validate payload
    if "affinity" not in payload:
        raise ValueError("Missing required field: affinity")

    affinity = float(payload["affinity"])
    schema_key = payload.get("schema_key", "default")

    # Load world and schemas
    result = await db.execute(
        select(GameWorld).where(GameWorld.id == world_id)
    )
    world = result.scalar_one_or_none()

    if not world:
        raise ValueError(f"World not found: {world_id}")

    # Extract schemas from world meta
    relationship_schemas = world.meta.get("relationship_schemas", {}) if world.meta else {}

    # Compute tier
    tier_id = compute_relationship_tier(affinity, relationship_schemas, schema_key)

    return {
        "tier_id": tier_id,
        "schema_key": schema_key,
        "affinity": affinity,
    }

async def evaluate_relationship_intimacy(
    world_id: int,
    payload: dict[str, Any],
    db: AsyncSession
) -> dict[str, Any]:
    """Evaluate relationship intimacy metric."""
    # Validate payload
    if "relationship_values" not in payload:
        raise ValueError("Missing required field: relationship_values")

    rel_values = payload["relationship_values"]
    required_fields = ["affinity", "trust", "chemistry", "tension"]

    for field in required_fields:
        if field not in rel_values:
            raise ValueError(f"Missing required relationship value: {field}")

    relationship_values = {
        "affinity": float(rel_values["affinity"]),
        "trust": float(rel_values["trust"]),
        "chemistry": float(rel_values["chemistry"]),
        "tension": float(rel_values["tension"]),
    }

    # Load world and schemas
    result = await db.execute(
        select(GameWorld).where(GameWorld.id == world_id)
    )
    world = result.scalar_one_or_none()

    if not world:
        raise ValueError(f"World not found: {world_id}")

    # Extract intimacy schema
    intimacy_schema = world.meta.get("intimacy_schema") if world.meta else None

    # Compute intimacy level
    intimacy_level_id = compute_intimacy_level(relationship_values, intimacy_schema)

    return {
        "intimacy_level_id": intimacy_level_id,
        "relationship_values": relationship_values,
    }
```

---

**Design Principles:**

1. **Specific Endpoints for Discoverability**: RESTful endpoints make it clear what previews are available
2. **Generic Internal Implementation**: Metric registry allows easy addition of new metrics
3. **Schema-Aware**: All evaluators load world-specific schemas from `GameWorld.meta`
4. **Stateless & Pure**: Preview APIs are read-only, no session mutations
5. **Input Validation**: Explicit validation of required fields with helpful errors
6. **Echo Inputs**: Responses include input values for verification/debugging
7. **Extensible**: New metrics can be added by:
   - Implementing a metric evaluator function
   - Registering it in the registry
   - Creating a new endpoint (or using a future generic endpoint)

**Future Metric Examples:**

```python
# Future: NPC mood evaluation
async def evaluate_npc_mood(
    world_id: int,
    payload: dict[str, Any],
    db: AsyncSession
) -> dict[str, Any]:
    npc_id = payload["npc_id"]
    stress_level = payload["stress_level"]
    social_satisfaction = payload["social_satisfaction"]
    # ... mood computation logic
    return {"mood_id": "content", "npc_id": npc_id}

# Future: Reputation band evaluation
async def evaluate_reputation_band(
    world_id: int,
    payload: dict[str, Any],
    db: AsyncSession
) -> dict[str, Any]:
    faction_id = payload["faction_id"]
    reputation_score = payload["reputation_score"]
    # ... reputation band logic
    return {"band_id": "neutral", "faction_id": faction_id}
```

**Extension Strategy for Phase 7:**

When generalizing in Phase 7, we can optionally add a **generic preview endpoint**:

```http
POST /api/v1/game/preview-metric
```

Request:
```typescript
{
  "world_id": number;
  "metric": "relationship_tier" | "relationship_intimacy" | "npc_mood" | ...;
  "payload": Record<string, any>;
}
```

This would delegate to the same metric registry infrastructure, giving us both specific endpoints (for common use) and a generic endpoint (for dynamic tooling).

---

### Phase 3 – Implement Backend Relationship Preview Endpoint(s)

**Goal**
Implement the preview API on the backend, reusing existing Python logic and world schemas.

**Scope**
- New read‑only API(s) in the backend.
- No changes to how existing runtime computations work.

**Key Steps**
1. Implement endpoint(s) in the appropriate module, e.g.:
   - `pixsim7_backend/api/v1/game_relationships_preview.py` or within an existing `game` API module.
2. Inside the endpoint:
   - Load `GameWorld` and its `meta.relationship_schemas` / `meta.intimacy_schema` for `world_id`.
   - Call existing functions:
     - `compute_relationship_tier(affinity, relationship_schemas, schema_key)`
     - `compute_intimacy_level(relationship_values, intimacy_schema)`
   - Return JSON using the contracts from Phase 2.
3. Write backend tests to assert:
   - Preview endpoints produce the same result as the existing session‑update logic for a given input + schema.
4. Ensure endpoints do **not** mutate any `GameSession`; they are pure stateless evaluators.

---

**Phase 3 Implementation Summary** ✅ *Completed 2025-11-19*

**Files Created:**

1. **Metrics Domain Module** (`pixsim7_backend/domain/metrics/`)
   - `__init__.py` - Module exports
   - `types.py` - MetricType enum and MetricEvaluator protocol
   - `registry.py` - MetricRegistry class for managing evaluators
   - `relationship_evaluators.py` - Evaluator functions for tier/intimacy preview

2. **API Endpoints** (`pixsim7_backend/api/v1/`)
   - `game_relationship_preview.py` - FastAPI router with preview endpoints
     - `POST /api/v1/game/relationships/preview-tier`
     - `POST /api/v1/game/relationships/preview-intimacy`

3. **Route Plugin** (`pixsim7_backend/routes/game_relationship_preview/`)
   - `__init__.py` - Plugin module
   - `manifest.py` - Plugin manifest for auto-discovery

4. **Tests** (`tests/`)
   - `test_relationship_preview_api.py` - Comprehensive test suite
     - Tests for default and custom schemas
     - Tests for boundary values
     - Tests for error cases (world not found, missing fields)
     - Tests for edge cases (extreme values)

**Implementation Details:**

- **Metric Evaluators**:
  - `evaluate_relationship_tier()` - Loads world schemas and computes tier ID
  - `evaluate_relationship_intimacy()` - Loads world schemas and computes intimacy level
  - Both functions are async and load world data from the database
  - Comprehensive input validation with helpful error messages
  - Reuse existing domain logic from `relationships.py`

- **API Design**:
  - Follows established patterns from other game API endpoints
  - Uses Pydantic models for request/response validation
  - Proper error handling (404 for world not found, 400 for invalid input)
  - Echoes input values in responses for verification
  - Stateless read-only operations (no session mutations)

- **Plugin System Integration**:
  - Route plugin registered under `/api/v1/game/relationships` prefix
  - Auto-discovered and loaded on app startup
  - No auth dependencies (preview endpoints are public)
  - Requires database, doesn't require Redis

- **Test Coverage**:
  - 15+ test cases covering happy path, error cases, and edge cases
  - Tests use pytest-asyncio for async testing
  - Fixture for creating test world with custom schemas
  - Tests verify both default and custom schema evaluation

**Verification:**

The implementation:
- ✅ Reuses existing `compute_relationship_tier` and `compute_intimacy_level` logic
- ✅ Loads world-specific schemas from `GameWorld.meta`
- ✅ Returns responses matching Phase 2 design contracts
- ✅ Is stateless (no GameSession mutations)
- ✅ Has comprehensive test coverage
- ✅ Integrates cleanly with existing plugin infrastructure

---

### Phase 4 – Add Game-Core TS Wrappers & Types

**Goal**  
Expose typed preview helpers in game-core that call the backend API, replacing local math.

**Scope**
- Only game-core (packages/game-core) and types.
- No frontend logic beyond switching call sites.

**Key Steps**
1. In `@pixsim7/types`, add types for preview responses if needed, e.g.:
   ```ts
   export interface RelationshipTierPreview {
     tierId: string | null;
     schemaKey?: string;
   }

   export interface RelationshipIntimacyPreview {
     intimacyLevelId: string | null;
   }
   ```
2. In `packages/game-core/src/relationships/`, add a small module (e.g. `preview.ts`) that exports:
   ```ts
   export async function previewRelationshipTier(args: {
     worldId: number;
     affinity: number;
   }): Promise<RelationshipTierPreview> { /* calls backend */ }

   export async function previewIntimacyLevel(args: {
     worldId: number;
     affinity: number;
     trust: number;
     chemistry: number;
     tension: number;
   }): Promise<RelationshipIntimacyPreview> { /* calls backend */ }
   ```
3. Wire these through the game-core public API (`packages/game-core/src/index.ts`).
4. Mark existing TS functions `compute_relationship_tier` / `compute_intimacy_level` as deprecated in JSDoc and ensure they are no longer used by new code.

---

**Phase 4 Implementation Summary** ✅ *Completed 2025-11-19*

**Files Created/Modified:**

1. **Types Package** (`packages/types/src/game.ts`)
   - Added `RelationshipTierPreviewRequest` interface
   - Added `RelationshipTierPreviewResponse` interface
   - Added `RelationshipValues` interface
   - Added `RelationshipIntimacyPreviewRequest` interface
   - Added `RelationshipIntimacyPreviewResponse` interface

2. **Game-Core Preview Module** (`packages/game-core/src/relationships/preview.ts`)
   - `previewRelationshipTier()` - Async function to call tier preview API
   - `previewIntimacyLevel()` - Async function to call intimacy preview API
   - `configurePreviewApi()` - Configure base URL and fetch function
   - `resetPreviewApiConfig()` - Reset to default configuration
   - `getPreviewApiConfig()` - Get current configuration (for testing)
   - Full JSDoc documentation with examples
   - Configurable fetch and base URL for testing/flexibility

3. **Deprecation Markers** (`packages/game-core/src/relationships/computation.ts`)
   - Added `@deprecated` JSDoc tags to `compute_relationship_tier()`
   - Added `@deprecated` JSDoc tags to `compute_intimacy_level()`
   - Updated documentation to point users to preview API
   - Noted that functions only support hardcoded defaults, not world schemas

4. **Game-Core Exports** (`packages/game-core/src/index.ts`)
   - Added exports for preview functions
   - Added exports for configuration functions
   - Clearly marked deprecated functions vs. recommended preview API

5. **Tests** (`packages/game-core/src/relationships/__tests__/preview.test.ts`)
   - Unit tests for `previewRelationshipTier()`
   - Unit tests for `previewIntimacyLevel()`
   - Tests for API configuration
   - Tests for error handling
   - Mock fetch for isolated testing

**Implementation Details:**

- **Preview API Client**:
  - Uses native `fetch` API for HTTP calls
  - Configurable base URL (defaults to `/api/v1`)
  - Custom fetch function support for testing/mocking
  - Proper error handling with helpful messages
  - Converts snake_case backend responses to camelCase TypeScript
  - Type-safe with full TypeScript interfaces

- **Deprecation Strategy**:
  - Existing functions kept for backward compatibility
  - Clear deprecation warnings guide migration
  - Functions will be removed in Phase 6

- **Type Safety**:
  - All request/response types defined in `@pixsim7/types`
  - Shared between frontend and game-core
  - Matches backend API contracts exactly

**Verification:**

The implementation:
- ✅ Exposes typed preview helpers that call backend API
- ✅ Adds comprehensive types to `@pixsim7/types`
- ✅ Wires preview functions through game-core public API
- ✅ Marks deprecated functions with `@deprecated` JSDoc
- ✅ Provides configuration for testing and flexibility
- ✅ Includes comprehensive unit tests

**Migration Path:**

Before (deprecated):
```ts
import { compute_relationship_tier } from '@pixsim7/game-core';
const tier = compute_relationship_tier(75.0); // Only uses hardcoded defaults!
```

After (recommended):
```ts
import { previewRelationshipTier } from '@pixsim7/game-core';
const preview = await previewRelationshipTier({
  worldId: 1,
  affinity: 75.0,
  schemaKey: 'default'
});
console.log(preview.tierId); // Uses world-specific schemas!
```

---

### Phase 5 – Migrate Editor/Tooling to Preview API

**Goal**  
Ensure all frontend/editor use cases that need “what would this label be?” use the preview API, not TS math.

**Scope**
- Frontend/editor tools only (scene editor, Relationship dashboards, dev tools).

**Key Steps**
1. Identify UI/editor flows that currently:
   - Call game-core’s `compute_relationship_tier` / `compute_intimacy_level` directly.
   - Or otherwise rely on TS’s fallback math.
2. Replace those calls with:
   - Game-core preview helpers (`previewRelationshipTier`, `previewIntimacyLevel`).
   - Or, where the runtime session already has `tierId`/`intimacyLevelId`, read those from `GameSession.relationships` instead of recomputing.
3. Add minimal UI debouncing where necessary (e.g. sliders) to avoid spamming preview requests.
4. Confirm that **runtime** paths (Game2D, Simulation Playground) do **not** start using preview for canonical state; they should still rely on backend‑computed values in sessions.

---

**Phase 5 Implementation Summary** ✅ *Completed 2025-11-19*

**Findings:**

After auditing all frontend and game-core code for relationship computation usage, **no editor/preview use cases were found that require migration**. The current architecture is already correctly structured:

1. **Runtime Display (RelationshipDashboard)**:
   - Uses `getNpcRelationshipState()` from game-core
   - Reads backend-computed `tierId` and `intimacyLevelId` from session
   - Only uses fallback computation when backend values are missing
   - **No changes needed** - already consumes backend authority

2. **Fallback Computation**:
   - `packages/game-core/src/core/PixSim7Core.ts:121-124` - Runtime fallback
   - `packages/game-core/src/session/state.ts:78-81` - Runtime fallback
   - These are **intentional fallbacks** for backward compatibility
   - Will be addressed in Phase 6 (deprecation) and Phase 10 (offline strategy)

3. **No Editor Preview Features Currently Exist**:
   - No sliders with live tier/intimacy preview
   - No "what-if" relationship calculators
   - No relationship schema editors

**Guidance for Future Development:**

When implementing editor/preview features (e.g., relationship schema editor, tier threshold sliders), developers should:

1. **Use the preview API**:
   ```ts
   import { previewRelationshipTier } from '@pixsim7/game-core';

   const preview = await previewRelationshipTier({
     worldId: 1,
     affinity: sliderValue,
     schemaKey: 'default'
   });

   setPreviewTier(preview.tierId);
   ```

2. **Never use deprecated compute functions**:
   - `compute_relationship_tier()` - deprecated, only hardcoded defaults
   - `compute_intimacy_level()` - deprecated, only hardcoded defaults

3. **For runtime display**, read from session:
   ```ts
   const rel = getNpcRelationshipState(session, npcId);
   // rel.tierId and rel.intimacyLevelId are backend-computed
   ```

**Verification:**

- ✅ No editor/preview use cases found requiring migration
- ✅ Runtime display already uses backend-computed values
- ✅ Fallback logic is intentional for backward compatibility
- ✅ Clear guidance documented for future editor features
- ✅ Preview API ready and tested for when needed

**Status**: Phase 5 complete - no code changes needed, architecture already correct.

---

### Phase 6 – Remove TS Fallback Logic for Relationships

**Goal**  
Eliminate duplicated relationship math from TS so backend is the only place where thresholds are defined.

**Scope**
- `packages/game-core/src/relationships/computation.ts` and any dependent TS tests.

**Key Steps**
1. Once all usages are migrated:
   - Remove or strip down `compute_relationship_tier` and `compute_intimacy_level` from TS.
   - Keep `extract_relationship_values` if still useful (it’s just data extraction, not logic).
2. Update or remove TS tests that assert tier/intimacy logic:
   - Replace them with tests for preview helpers (mock backend responses or run integration tests).
3. Ensure no remaining TS code imports the removed functions.

---

### Phase 7 – Generalize Metric System for Future Social/Sim Derivations

**Goal**  
Turn the relationship preview pattern into a generic “metric preview” system that can support other derived values later.

**Scope**
- Backend preview endpoint(s) and game-core wrappers.

**Key Steps**
1. If not already done, generalize the preview endpoint to accept:
   ```jsonc
   {
     "world_id": 1,
     "metric": "relationship_tier" | "relationship_intimacy" | "npc_mood" | "reputation_band",
     "payload": { ... }
   }
   ```
2. Implement a small metric registry on the backend:
   - Map `metric` strings to evaluator functions and schemas.
3. In game-core, create a generic `previewMetric` helper that:
   - Takes `metric` + payload and returns a typed result (using generics).
4. Keep the relationship preview helpers as thin wrappers around this generic metric preview.

---

### Phase 8 – Documentation & App Map Updates

**Goal**  
Document the new architecture clearly and expose the preview API in dev tooling.

**Scope**
- Docs and App Map.

**Key Steps**
1. Update `docs/RELATIONSHIPS_AND_ARCS.md` to:
   - Emphasize backend as the only authority for tiers/intimacy.
   - Document the preview API as the only way to compute labels for “what‑if” tools.
2. Update `docs/SYSTEM_OVERVIEW.md` and `docs/APP_MAP.md` to:
   - Reference the relationship preview API under game systems.
3. In `06-app-map-and-dev-panel.md` (and the corresponding implementation), consider adding:
   - A small section showing the new preview API under “Capabilities” or “Game Systems”.

---

### Phase 9 – Regression & Behavior Validation

**Goal**  
Ensure the architectural change does not change actual relationship behavior for existing worlds.

**Scope**
- Comparison between “old TS fallback” and “new backend preview” results, for both defaults and custom schemas.

**Key Steps**
1. Create test fixtures with:
   - Default world schemas.
   - At least one world with custom `relationship_schemas` and `intimacy_schema`.
2. For a grid of affinity/trust/chemistry/tension inputs:
   - Compare:
     - Old TS computation (before removal).
     - Backend preview API results.
   - Confirm parity (or document and accept any deliberate differences).
3. For a few existing sessions:
   - Capture current `tierId`/`intimacyLevelId`.
   - Run the preview API offline and confirm it agrees with stored values given the same schemas.

---

### Phase 10 – Optional Offline Tooling Strategy

**Goal**  
Decide how to handle editor tooling when the backend preview API is unavailable (offline or dev issues).

**Scope**
- Optional fallback strategy; keep it simple.

**Key Steps**
1. Decide whether offline preview is required:
   - If **no**: allow preview helpers to fail gracefully (e.g. show “unknown” / “backend unavailable”) and do nothing else.
   - If **yes** for specific workflows: consider keeping a **dev‑only** TS implementation behind a feature flag that is:
     - Clearly marked as “approximate/offline only”.
     - Never used in runtime or tests that care about correctness.
2. Document the chosen policy in `RELATIONSHIPS_AND_ARCS.md` and/or a small `DEV_NOTES.md` section:
   - Make it explicit where approximation is allowed and where it is not.

