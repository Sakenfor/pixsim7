# World and Sessions System - Issues and Fixes

**Analysis Date**: 2025-12-02
**Scope**: World management, session handling, relationship normalization, and time tracking

---

## 🔴 HIGH SEVERITY

### Issue #1: Race Condition in World Time Advancement

**File**: `pixsim7/backend/main/services/game/game_world_service.py`
**Lines**: 55-80

**Problem**: Two concurrent `advance_world_time` calls can read the same `world_time`, increment independently, and overwrite each other, causing lost updates.

**Current Code**:
```python
state = await self.db.get(GameWorldState, world_id)
# ... lazy initialization ...
state.world_time = float(state.world_time or 0.0) + float(delta_seconds)
state.last_advanced_at = datetime.utcnow()
self.db.add(state)
await self.db.commit()
```

**Suggested Fix**:
```python
from sqlalchemy import update

async def advance_world_time(
    self,
    *,
    world_id: int,
    delta_seconds: float,
) -> GameWorldState:
    if delta_seconds < 0:
        delta_seconds = 0.0

    # Atomic update at database level
    result = await self.db.execute(
        update(GameWorldState)
        .where(GameWorldState.world_id == world_id)
        .values(
            world_time=GameWorldState.world_time + delta_seconds,
            last_advanced_at=datetime.utcnow()
        )
        .returning(GameWorldState)
    )

    state = result.scalar_one_or_none()

    if not state:
        # Lazily initialize if missing
        world = await self.db.get(GameWorld, world_id)
        if not world:
            raise ValueError("world_not_found")
        state = GameWorldState(world_id=world.id, world_time=delta_seconds)
        self.db.add(state)
        await self.db.commit()
        await self.db.refresh(state)
    else:
        await self.db.commit()

    return state
```

---

## 🟡 MEDIUM SEVERITY

### Issue #2: Orphaned World State on Transaction Failure

**File**: `pixsim7/backend/main/services/game/game_world_service.py`
**Lines**: 24-41

**Problem**: World is committed before state. If state creation fails, world exists without state record.

**Current Code**:
```python
world = GameWorld(owner_user_id=owner_user_id, name=name, meta=meta or {})
self.db.add(world)
await self.db.commit()
await self.db.refresh(world)

# Initialize world state with zero world_time.
state = GameWorldState(world_id=world.id, world_time=0.0)
self.db.add(state)
await self.db.commit()
```

**Suggested Fix**:
```python
async def create_world(
    self,
    *,
    owner_user_id: int,
    name: str,
    meta: Optional[dict] = None,
) -> GameWorld:
    world = GameWorld(owner_user_id=owner_user_id, name=name, meta=meta or {})
    self.db.add(world)
    await self.db.flush()  # Get world.id without committing

    # Initialize world state with zero world_time.
    state = GameWorldState(world_id=world.id, world_time=0.0)
    self.db.add(state)

    # Commit both together
    await self.db.commit()
    await self.db.refresh(world)

    return world
```

---

### Issue #3: No World Ownership Validation in Session Creation

**File**: `pixsim7/backend/main/services/game/game_session_service.py`
**Lines**: 146-173

**Problem**: Users can create sessions linked to worlds they don't own, accessing other users' schemas.

**Current Code**:
```python
async def create_session(
    self, *, user_id: int, scene_id: int, world_id: Optional[int] = None, flags: Optional[Dict[str, Any]] = None
) -> GameSession:
    scene = await self._get_scene(scene_id)
    session = GameSession(
        user_id=user_id,
        scene_id=scene.id,
        current_node_id=scene.entry_node_id,
        world_id=world_id,  # No validation!
        flags=flags or {},
    )
```

**Suggested Fix**:
```python
async def create_session(
    self, *, user_id: int, scene_id: int, world_id: Optional[int] = None, flags: Optional[Dict[str, Any]] = None
) -> GameSession:
    scene = await self._get_scene(scene_id)

    # Validate world ownership if world_id provided
    if world_id is not None:
        result = await self.db.execute(
            select(GameWorld).where(GameWorld.id == world_id)
        )
        world = result.scalar_one_or_none()
        if not world:
            raise ValueError("world_not_found")
        if world.owner_user_id != user_id:
            raise ValueError("world_access_denied")

    session = GameSession(
        user_id=user_id,
        scene_id=scene.id,
        current_node_id=scene.entry_node_id,
        world_id=world_id,
        flags=flags or {},
    )
    # ... rest of method
```

---

### Issue #4: Relationship Tier Overlap Handling

**File**: `pixsim7/backend/main/domain/narrative/relationships.py`
**Lines**: 32-40

**Problem**: Overlapping tier ranges cause non-deterministic tier assignment.

**Current Code**:
```python
# Find the matching tier
for tier in tiers:
    if "min" in tier and "max" in tier:
        if tier["min"] <= affinity <= tier["max"]:
            return tier.get("id")
```

**Suggested Fix**:
```python
# Sort tiers by min value for deterministic matching
sorted_tiers = sorted(tiers, key=lambda t: t.get("min", 0))

# Find the matching tier (first match wins)
for tier in sorted_tiers:
    if "min" in tier and "max" in tier:
        if tier["min"] <= affinity <= tier["max"]:
            return tier.get("id")
    elif "min" in tier:
        if affinity >= tier["min"]:
            return tier.get("id")

return None
```

**Note**: Also ensure schema validation prevents overlaps at creation time.

---

### Issue #5: Unbounded Session Events Table Growth

**File**: `pixsim7/backend/main/services/game/game_session_service.py`
**Lines**: 161-168, 199-206

**Problem**: `GameSessionEvent` records accumulate indefinitely, causing database bloat.

**Suggested Fix - Option A (Retention Policy)**:

Add to `GameSessionService`:
```python
async def _cleanup_old_events(self, session_id: int, keep_last_n: int = 1000) -> None:
    """Keep only the last N events for a session."""
    # Get the threshold timestamp
    result = await self.db.execute(
        select(GameSessionEvent.ts)
        .where(GameSessionEvent.session_id == session_id)
        .order_by(GameSessionEvent.ts.desc())
        .offset(keep_last_n)
        .limit(1)
    )
    threshold_ts = result.scalar_one_or_none()

    if threshold_ts:
        await self.db.execute(
            delete(GameSessionEvent)
            .where(
                GameSessionEvent.session_id == session_id,
                GameSessionEvent.ts < threshold_ts
            )
        )
```

Call after creating events in `create_session`, `advance_session`, etc.

**Suggested Fix - Option B (Background Job)**:

Create scheduled task (e.g., daily):
```python
# In a background worker/scheduler
async def cleanup_old_session_events(db: AsyncSession):
    """Delete events older than 30 days."""
    from datetime import timedelta
    threshold = datetime.utcnow() - timedelta(days=30)

    await db.execute(
        delete(GameSessionEvent)
        .where(GameSessionEvent.ts < threshold)
    )
    await db.commit()
```

---

### Issue #6: World Time Wrapping Inconsistency

**File (Backend)**: `pixsim7/backend/main/services/game/game_world_service.py:75`
**File (Frontend)**: `packages/game/engine/src/world/worldTime.ts`

**Problem**: Frontend wraps time at 604,800 seconds (1 week), backend stores monotonic time. Mismatch could cause confusion.

**Suggested Fix - Option A (Backend Wrapping)**:

```python
# In game_world_service.py
WEEK_SECONDS = 604800

async def advance_world_time(
    self,
    *,
    world_id: int,
    delta_seconds: float,
) -> GameWorldState:
    # ... existing code ...

    # Apply wrapping at week boundary
    state.world_time = (float(state.world_time or 0.0) + float(delta_seconds)) % WEEK_SECONDS

    # ... rest of method
```

**Suggested Fix - Option B (Documentation)**:

Add to docstrings:
```python
"""
Note: Backend stores monotonic (unwrapped) world_time.
Frontend must handle week-boundary wrapping (604,800s) for display.
Do not send wrapped values to backend.
"""
```

---

### Issue #7: No Safety Validation for Scheduler Config Values

**File**: `pixsim7/backend/main/api/v1/game_worlds.py`
**Lines**: 746-802

**Problem**: Pydantic validates structure but not business logic constraints (e.g., timeScale=0).

**Suggested Fix**:

```python
@router.put("/{world_id}/scheduler/config", response_model=Dict[str, Any])
async def update_scheduler_config(
    world_id: int,
    req: UpdateSchedulerConfigRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> Dict[str, Any]:
    # ... existing code to get current_config ...

    # Apply updates
    updates = req.dict(exclude_unset=True)
    for key, value in updates.items():
        current_config[key] = value

    # Business logic validation
    if "timeScale" in updates and updates["timeScale"] <= 0:
        raise HTTPException(
            status_code=400,
            detail="timeScale must be positive"
        )

    if "maxNpcTicksPerStep" in updates and updates["maxNpcTicksPerStep"] < 0:
        raise HTTPException(
            status_code=400,
            detail="maxNpcTicksPerStep cannot be negative"
        )

    if "maxJobOpsPerStep" in updates and updates["maxJobOpsPerStep"] < 0:
        raise HTTPException(
            status_code=400,
            detail="maxJobOpsPerStep cannot be negative"
        )

    if "tickIntervalSeconds" in updates and updates["tickIntervalSeconds"] <= 0:
        raise HTTPException(
            status_code=400,
            detail="tickIntervalSeconds must be positive"
        )

    # Validate updated config
    try:
        WorldSchedulerConfigSchema(**current_config)
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_scheduler_config",
                "details": e.errors(),
            }
        )

    # ... rest of method
```

---

### Issue #8: Unnecessary Relationship Normalization

**File**: `pixsim7/backend/main/services/game/game_session_service.py`
**Lines**: 171, 215, 271

**Problem**: Normalizes relationships even when they haven't changed or are empty.

**Suggested Fix**:

```python
async def create_session(
    self, *, user_id: int, scene_id: int, world_id: Optional[int] = None, flags: Optional[Dict[str, Any]] = None
) -> GameSession:
    # ... existing creation code ...

    # Only normalize if relationships exist
    if session.relationships:
        await self._normalize_session_relationships(session)

    return session

async def advance_session(self, *, session_id: int, edge_id: int) -> GameSession:
    # ... existing advancement code ...

    # Only normalize if relationships exist
    if session.relationships:
        await self._invalidate_cached_relationships(session.id)
        await self._normalize_session_relationships(session)

    return session

async def update_session(
    self,
    *,
    session_id: int,
    world_time: Optional[float] = None,
    flags: Optional[Dict[str, Any]] = None,
    relationships: Optional[Dict[str, Any]] = None,
    expected_version: Optional[int] = None,
) -> GameSession:
    # ... existing validation and update code ...

    # Only normalize if relationships were updated
    if relationships is not None:
        await self._invalidate_cached_relationships(session.id)
        await self._normalize_session_relationships(session)

    return session
```

---

## 🟢 LOW SEVERITY

### Issue #9: Version Incremented on No-Op Updates

**File**: `pixsim7/backend/main/services/game/game_session_service.py`
**Lines**: 219-273

**Problem**: Version increments even if no actual changes are made.

**Suggested Fix**:

```python
async def update_session(
    self,
    *,
    session_id: int,
    world_time: Optional[float] = None,
    flags: Optional[Dict[str, Any]] = None,
    relationships: Optional[Dict[str, Any]] = None,
    expected_version: Optional[int] = None,
) -> GameSession:
    session = await self.db.get(GameSession, session_id)
    if not session:
        raise ValueError("session_not_found")

    # Check version for optimistic locking
    if expected_version is not None and session.version != expected_version:
        raise ValueError("version_conflict")

    # Track if any changes were made
    changed = False

    # ... existing validation ...

    if world_time is not None and world_time != session.world_time:
        session.world_time = float(world_time)
        changed = True

    if flags is not None and flags != session.flags:
        session.flags = flags
        changed = True

    if relationships is not None and relationships != session.relationships:
        session.relationships = relationships
        changed = True

    # Only increment version if changes were made
    if changed:
        session.version += 1

    self.db.add(session)
    await self.db.commit()
    await self.db.refresh(session)

    # Only normalize if relationships were updated
    if relationships is not None:
        await self._invalidate_cached_relationships(session.id)
        await self._normalize_session_relationships(session)

    return session
```

---

### Issue #10: API Inconsistency - GET vs POST/PATCH Normalization

**File**: `pixsim7/backend/main/services/game/game_session_service.py`
**Lines**: 175-182

**Problem**: GET returns raw relationships, POST/PATCH return normalized. Inconsistent API behavior.

**Suggested Fix - Option A (Normalize on GET)**:

```python
async def get_session(self, session_id: int, normalize: bool = True) -> Optional[GameSession]:
    """
    Get session with optional normalization.

    Args:
        session_id: Session ID to retrieve
        normalize: Whether to compute tierId/intimacyLevelId (default: True)
    """
    session = await self.db.get(GameSession, session_id)

    if session and normalize and session.relationships:
        await self._normalize_session_relationships(session)

    return session
```

**Suggested Fix - Option B (Document Behavior)**:

```python
async def get_session(self, session_id: int) -> Optional[GameSession]:
    """
    Get session without normalization.

    IMPORTANT: This returns raw relationship data without computed
    tierId/intimacyLevelId fields. Clients should either:
    1. Use cached values from previous POST/PATCH responses
    2. Compute tiers locally using world schemas
    3. Perform a PATCH with empty body to trigger normalization

    This optimization avoids redundant database queries when the client
    doesn't need fresh computed values.
    """
    session = await self.db.get(GameSession, session_id)
    return session
```

---

### Issue #11: No Pagination for list_worlds

**File**: `pixsim7/backend/main/api/v1/game_worlds.py`
**Lines**: 68-77

**Problem**: Returns all worlds without pagination. Slow for users with many worlds.

**Suggested Fix**:

```python
from typing import List, Optional

class PaginatedWorldsResponse(BaseModel):
    worlds: List[GameWorldSummary]
    total: int
    offset: int
    limit: int

@router.get("/", response_model=PaginatedWorldsResponse)
async def list_worlds(
    game_world_service: GameWorldSvc,
    user: CurrentUser,
    offset: int = 0,
    limit: int = 100,
) -> PaginatedWorldsResponse:
    """
    List game worlds owned by the current user with pagination.

    Args:
        offset: Number of records to skip (default: 0)
        limit: Maximum records to return (default: 100, max: 1000)
    """
    # Clamp limit to reasonable range
    limit = min(max(1, limit), 1000)

    # Get total count
    count_result = await game_world_service.db.execute(
        select(func.count()).select_from(GameWorld).where(GameWorld.owner_user_id == user.id)
    )
    total = count_result.scalar_one()

    # Get paginated results
    result = await game_world_service.db.execute(
        select(GameWorld)
        .where(GameWorld.owner_user_id == user.id)
        .order_by(GameWorld.id)
        .offset(offset)
        .limit(limit)
    )
    worlds = list(result.scalars().all())

    return PaginatedWorldsResponse(
        worlds=[GameWorldSummary(id=w.id, name=w.name) for w in worlds],
        total=total,
        offset=offset,
        limit=limit,
    )
```

---

### Issue #12: Redis Failures Not Observable

**File**: Multiple locations with Redis try/except blocks

**Problem**: Redis failures are silently ignored, making issues invisible.

**Suggested Fix - Add Logging**:

```python
import logging

logger = logging.getLogger(__name__)

async def _get_cached_relationships(self, session_id: int) -> Optional[Dict]:
    """Retrieve cached relationship computations from Redis."""
    if not self.redis:
        return None

    try:
        cache_key = f"session:{session_id}:relationships"
        cached = await self.redis.get(cache_key)
        return json.loads(cached) if cached else None
    except Exception as e:
        # Log warning for observability
        logger.warning(
            f"Redis cache read failed for session {session_id}: {e}",
            extra={"session_id": session_id, "operation": "cache_read"}
        )
        return None

async def _cache_relationships(self, session_id: int, relationships: Dict):
    """Cache relationship computations in Redis with 60s TTL."""
    if not self.redis:
        return

    try:
        cache_key = f"session:{session_id}:relationships"
        await self.redis.setex(cache_key, 60, json.dumps(relationships))
    except Exception as e:
        # Log warning for observability
        logger.warning(
            f"Redis cache write failed for session {session_id}: {e}",
            extra={"session_id": session_id, "operation": "cache_write"}
        )
```

Apply similar pattern to all Redis operations in:
- `game_session_service.py:35-70`
- `game_world_service.py:114-137`

---

### Issue #13: Session Adapter UI Flicker During Retries

**File**: `apps/main/src/lib/game/interactions/sessionAdapter.ts`
**Lines**: 97-157

**Problem**: Multiple optimistic updates during retry loops cause UI flicker.

**Suggested Fix**:

```typescript
const applyOptimisticUpdate = async (
  localUpdate: (session: GameSessionDTO) => GameSessionDTO,
  backendUpdate: Partial<GameSessionDTO>,
  retryCount = 0
): Promise<GameSessionDTO> => {
  // 1. Optimistic update (instant UI) - only on first attempt
  if (retryCount === 0) {
    const optimistic = localUpdate(gameSession);
    onUpdate?.(optimistic);
  }

  // 2. Backend validation (if API available)
  if (api) {
    try {
      // Include version for optimistic locking
      const response = await api.updateSession(gameSession.id, {
        ...backendUpdate,
        expectedVersion: gameSession.version,
      });

      // 3a. Handle version conflicts with retry limit
      if (response.conflict && response.serverSession) {
        if (retryCount >= MAX_RETRIES) {
          logger.error(
            `Max retries (${MAX_RETRIES}) exceeded for session update. Giving up.`,
            { sessionId: gameSession.id, retryCount }
          );
          // Rollback to original state
          onUpdate?.(gameSession);
          throw new Error('Session update failed: too many conflicts');
        }

        logger.info(
          `Version conflict detected (attempt ${retryCount + 1}/${MAX_RETRIES}), resolving...`,
          { sessionId: gameSession.id, expectedVersion: gameSession.version, serverVersion: response.serverSession.version }
        );

        // Exponential backoff: wait before retrying
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);

        // Show loading state instead of flickering updates during retries
        if (retryCount === 0) {
          // Could emit loading event here if needed
          // eventBus.emit('session-update-retrying', { sessionId: gameSession.id });
        }

        await sleep(delayMs);

        // Re-apply local changes on top of server state
        const serverState = response.serverSession;
        const resolvedUpdate = localUpdate(serverState);

        // Update our local reference to server state
        const newBackendUpdate = {
          ...backendUpdate,
          // Extract only the fields we're updating from the resolved state
          ...(backendUpdate.flags && { flags: resolvedUpdate.flags }),
          ...(backendUpdate.relationships && { relationships: resolvedUpdate.relationships }),
          ...(backendUpdate.world_time && { world_time: resolvedUpdate.world_time }),
        };

        // Recursively retry with incremented counter
        // Note: Don't call onUpdate here to avoid UI flicker
        return applyOptimisticUpdate(
          (s) => resolvedUpdate,
          newBackendUpdate,
          retryCount + 1
        );
      }

      // 3b. No conflict - apply server truth
      if (response.session) {
        logger.info('Session update successful', { sessionId: gameSession.id, version: response.session.version });
        onUpdate?.(response.session);
        return response.session;
      }
    } catch (err) {
      // 3c. Rollback on error
      logger.error('Update failed, rolling back', err);
      onUpdate?.(gameSession);
      throw err;
    }
  }

  return localUpdate(gameSession);
};
```

---

### Issue #14: Missing Component Cleanup in Async Operations

**File**: `apps/main/src/lib/game/interactions/sessionAdapter.ts`
**Lines**: 97-174

**Problem**: Async operations don't check if component is still mounted before callbacks.

**Suggested Fix**:

```typescript
export function createSessionHelpers(
  gameSession: GameSessionDTO | null,
  onUpdate?: (session: GameSessionDTO) => void,
  api?: SessionAPI
): SessionHelpers {
  // Track if helpers are still active
  let isActive = true;

  // Cleanup function to prevent stale callbacks
  const cleanup = () => {
    isActive = false;
  };

  const applyOptimisticUpdate = async (
    localUpdate: (session: GameSessionDTO) => GameSessionDTO,
    backendUpdate: Partial<GameSessionDTO>,
    retryCount = 0
  ): Promise<GameSessionDTO> => {
    // Check if still active before proceeding
    if (!isActive) {
      throw new Error('Session helpers have been cleaned up');
    }

    // 1. Optimistic update (instant UI) - only on first attempt
    if (retryCount === 0) {
      const optimistic = localUpdate(gameSession);
      if (isActive) {
        onUpdate?.(optimistic);
      }
    }

    // ... rest of implementation, check isActive before onUpdate calls

    // 3b. No conflict - apply server truth
    if (response.session) {
      logger.info('Session update successful', { sessionId: gameSession.id, version: response.session.version });
      if (isActive) {
        onUpdate?.(response.session);
      }
      return response.session;
    }

    // ... etc
  };

  const helpers = {
    getNpcRelationship: (npcId) => getNpcRelationshipState(gameSession, npcId),
    updateNpcRelationship: async (npcId, patch) => { /* ... */ },
    // ... other helpers

    // Expose cleanup function
    cleanup,
  };

  return helpers as SessionHelpers;
}

// Update SessionHelpers type to include cleanup
export type SessionHelpers = {
  // ... existing methods
  cleanup: () => void;
};
```

Usage in components:
```typescript
useEffect(() => {
  const helpers = createSessionHelpers(session, onUpdate, api);

  return () => {
    helpers.cleanup();
  };
}, [session]);
```

---

### Issue #15: No Input Validation for Affinity Ranges

**File**: `pixsim7/backend/main/domain/narrative/relationships.py`
**Lines**: 8-42

**Problem**: Affinity values aren't clamped to valid range before computation.

**Suggested Fix**:

```python
def compute_relationship_tier(
    affinity: float,
    relationship_schemas: Dict[str, Any],
    schema_key: str = "default"
) -> Optional[str]:
    """
    Compute the relationship tier based on affinity value and world schema.

    Args:
        affinity: The affinity value (typically 0-100)
        relationship_schemas: World meta containing relationship tier definitions
        schema_key: Which schema to use (default: "default")

    Returns:
        The tier ID (e.g., "friend", "lover") or None if no match
    """
    # Clamp affinity to valid range
    affinity = max(0.0, min(100.0, float(affinity)))

    if not relationship_schemas or schema_key not in relationship_schemas:
        # Fallback to hardcoded defaults if no schema
        return _default_relationship_tier(affinity)

    # ... rest of implementation
```

Apply similar clamping to `compute_intimacy_level`:

```python
def compute_intimacy_level(
    relationship_values: Dict[str, float],
    intimacy_schema: Optional[Dict[str, Any]] = None
) -> Optional[str]:
    """
    Compute the intimacy level based on multiple relationship axes.
    """
    if not intimacy_schema or "levels" not in intimacy_schema:
        # Fallback to simple computation
        return _default_intimacy_level(relationship_values)

    levels = intimacy_schema.get("levels", [])
    if not isinstance(levels, list):
        return _default_intimacy_level(relationship_values)

    # Clamp all values to valid range (0-100)
    affinity = max(0.0, min(100.0, float(relationship_values.get("affinity", 0))))
    trust = max(0.0, min(100.0, float(relationship_values.get("trust", 0))))
    chemistry = max(0.0, min(100.0, float(relationship_values.get("chemistry", 0))))
    tension = max(0.0, min(100.0, float(relationship_values.get("tension", 0))))

    # ... rest of implementation
```

---

### Issue #16: Turn-Based Validation Tolerance Arbitrary

**File**: `pixsim7/backend/main/services/game/game_session_service.py`
**Lines**: 237-250

**Problem**: 1-second tolerance seems arbitrary and could have precision issues.

**Suggested Fix - Use Decimal**:

```python
from decimal import Decimal

async def update_session(
    self,
    *,
    session_id: int,
    world_time: Optional[float] = None,
    flags: Optional[Dict[str, Any]] = None,
    relationships: Optional[Dict[str, Any]] = None,
    expected_version: Optional[int] = None,
) -> GameSession:
    # ... existing code ...

    # Validate turn-based mode constraints
    if world_time is not None:
        effective_flags = flags if flags is not None else session.flags
        if effective_flags and effective_flags.get('sessionKind') == 'world':
            world_config = effective_flags.get('world', {})
            if world_config.get('mode') == 'turn_based':
                turn_delta = world_config.get('turnDeltaSeconds', 3600)

                # Use Decimal for precise comparison
                actual_delta = Decimal(str(world_time)) - Decimal(str(session.world_time))
                expected_delta = Decimal(str(turn_delta))
                tolerance = Decimal("0.001")  # 1ms tolerance for floating point

                # Allow turn delta advancement or no change
                if abs(actual_delta) > tolerance and abs(actual_delta - expected_delta) > tolerance:
                    raise ValueError(
                        f"turn_based_validation_failed: expected delta of {turn_delta}s, got {float(actual_delta)}s"
                    )

    # ... rest of method
```

---

### Issue #17: Schema Validation Only at API Layer

**File**: `pixsim7/backend/main/api/v1/game_worlds.py`
**Lines**: 89-100, 170-179

**Problem**: Services don't validate schemas, relying on API layer. Direct service calls could bypass validation.

**Suggested Fix - Move to Service**:

```python
# In game_world_service.py
from pixsim7.backend.main.domain.game.schemas import WorldMetaSchemas
from pydantic import ValidationError

async def create_world(
    self,
    *,
    owner_user_id: int,
    name: str,
    meta: Optional[dict] = None,
) -> GameWorld:
    # Validate schemas if meta provided
    if meta:
        try:
            WorldMetaSchemas.parse_obj(meta)
        except ValidationError as e:
            raise ValueError(f"invalid_world_schemas: {e}")

    world = GameWorld(owner_user_id=owner_user_id, name=name, meta=meta or {})
    self.db.add(world)
    await self.db.flush()

    state = GameWorldState(world_id=world.id, world_time=0.0)
    self.db.add(state)

    await self.db.commit()
    await self.db.refresh(world)

    return world

async def update_world_meta(
    self,
    world_id: int,
    meta: dict,
) -> GameWorld:
    """Update the metadata for a game world."""

    # Validate schemas
    try:
        WorldMetaSchemas.parse_obj(meta)
    except ValidationError as e:
        raise ValueError(f"invalid_world_schemas: {e}")

    world = await self.db.get(GameWorld, world_id)
    if not world:
        raise ValueError("world_not_found")

    world.meta = meta
    self.db.add(world)
    await self.db.commit()
    await self.db.refresh(world)

    # Invalidate cached relationships for all sessions linked to this world
    await self._invalidate_world_session_caches(world_id)

    return world
```

Then update API to handle service errors:

```python
# In game_worlds.py
@router.post("/", response_model=GameWorldDetail)
async def create_world(
    req: CreateWorldRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> GameWorldDetail:
    try:
        world = await game_world_service.create_world(
            owner_user_id=user.id,
            name=req.name,
            meta=req.meta or {},
        )
    except ValueError as e:
        if str(e).startswith("invalid_world_schemas"):
            raise HTTPException(status_code=400, detail=str(e))
        raise

    state = await game_world_service.get_world_state(world.id)
    return await _build_world_detail(world, game_world_service, state=state)
```

---

### Issue #18: Missing Transaction Management

**Files**: Multiple service methods

**Problem**: Multi-step operations lack explicit transaction boundaries.

**Suggested Fix - Add Transaction Context Manager**:

```python
# In infrastructure/database/session.py or similar
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession

@asynccontextmanager
async def atomic_transaction(db: AsyncSession):
    """
    Context manager for atomic transactions.
    Commits on success, rolls back on exception.
    """
    try:
        yield db
        await db.commit()
    except Exception:
        await db.rollback()
        raise
```

Usage example in services:

```python
from pixsim7.backend.main.infrastructure.database.session import atomic_transaction

async def create_world(
    self,
    *,
    owner_user_id: int,
    name: str,
    meta: Optional[dict] = None,
) -> GameWorld:
    async with atomic_transaction(self.db):
        # Validate schemas if meta provided
        if meta:
            try:
                WorldMetaSchemas.parse_obj(meta)
            except ValidationError as e:
                raise ValueError(f"invalid_world_schemas: {e}")

        world = GameWorld(owner_user_id=owner_user_id, name=name, meta=meta or {})
        self.db.add(world)
        await self.db.flush()

        state = GameWorldState(world_id=world.id, world_time=0.0)
        self.db.add(state)

        # Commit happens in context manager

    await self.db.refresh(world)
    return world
```

---

### Issue #19: Cache Invalidation Race Condition

**File**: `pixsim7/backend/main/services/game/game_session_service.py`
**Lines**: 212, 267

**Problem**: Cache invalidated before normalization. Concurrent processes could cache stale data.

**Suggested Fix - Invalidate After Update**:

```python
async def advance_session(self, *, session_id: int, edge_id: int) -> GameSession:
    session = await self.db.get(GameSession, session_id)
    if not session:
        raise ValueError("session_not_found")

    result = await self.db.execute(
        select(GameSceneEdge).where(GameSceneEdge.id == edge_id)
    )
    edge = result.scalar_one_or_none()
    if not edge or edge.from_node_id != session.current_node_id:
        raise ValueError("invalid_edge_for_current_node")

    session.current_node_id = edge.to_node_id
    self.db.add(session)

    event = GameSessionEvent(
        session_id=session.id,
        node_id=edge.to_node_id,
        edge_id=edge.id,
        action="advance",
        diff={"from_node_id": edge.from_node_id, "to_node_id": edge.to_node_id},
    )
    self.db.add(event)

    await self.db.commit()
    await self.db.refresh(session)

    # Normalize relationships before returning (this will cache the new values)
    await self._normalize_session_relationships(session)

    # No need to invalidate - normalization already cached fresh data

    return session

async def update_session(
    self,
    *,
    session_id: int,
    world_time: Optional[float] = None,
    flags: Optional[Dict[str, Any]] = None,
    relationships: Optional[Dict[str, Any]] = None,
    expected_version: Optional[int] = None,
) -> GameSession:
    # ... existing code ...

    await self.db.commit()
    await self.db.refresh(session)

    # Normalize relationships after update (will cache fresh data)
    if relationships is not None:
        await self._normalize_session_relationships(session)
        # No need to invalidate - normalization already cached fresh data

    return session
```

**Alternative - Lock-Based Cache Update**:

```python
async def _normalize_session_relationships(self, session: GameSession) -> None:
    """
    Compute and store tierId and intimacyLevelId for all NPC relationships.
    Uses cache locking to prevent race conditions.
    """
    if not session.relationships:
        return

    # Try to acquire lock for this session's cache
    if self.redis:
        lock_key = f"session:{session.id}:relationships:lock"
        lock_acquired = await self.redis.set(lock_key, "1", ex=5, nx=True)

        if not lock_acquired:
            # Another process is normalizing, skip
            return

        try:
            # Check cache after acquiring lock
            cached = await self._get_cached_relationships(session.id)
            if cached:
                session.relationships = cached
                return

            # Proceed with normalization...
            # ... existing normalization code ...

            # Cache results
            await self._cache_relationships(session.id, session.relationships)
        finally:
            # Release lock
            await self.redis.delete(lock_key)
```

---

### Issue #20: No Rate Limiting on Expensive Operations

**Files**: All API endpoints

**Problem**: No protection against abuse of expensive operations.

**Suggested Fix - Add Rate Limiting Middleware**:

```python
# In a new file: pixsim7/backend/main/middleware/rate_limit.py
from fastapi import Request, HTTPException
from typing import Callable
import time

class RateLimiter:
    """Simple in-memory rate limiter (use Redis in production)."""

    def __init__(self):
        self._requests = {}  # user_id -> [(timestamp, count)]

    def check_rate_limit(
        self,
        user_id: int,
        max_requests: int,
        window_seconds: int
    ) -> bool:
        """
        Check if user is within rate limit.

        Args:
            user_id: User to check
            max_requests: Maximum requests allowed
            window_seconds: Time window in seconds

        Returns:
            True if within limit, False if exceeded
        """
        now = time.time()
        cutoff = now - window_seconds

        # Clean old entries
        if user_id in self._requests:
            self._requests[user_id] = [
                (ts, count) for ts, count in self._requests[user_id]
                if ts > cutoff
            ]
        else:
            self._requests[user_id] = []

        # Count requests in window
        total = sum(count for ts, count in self._requests[user_id])

        if total >= max_requests:
            return False

        # Add current request
        self._requests[user_id].append((now, 1))
        return True

# Global rate limiter instance
rate_limiter = RateLimiter()

def rate_limit(max_requests: int = 100, window_seconds: int = 60):
    """
    Decorator for rate limiting endpoints.

    Args:
        max_requests: Max requests per window
        window_seconds: Time window in seconds
    """
    def decorator(func: Callable):
        async def wrapper(*args, **kwargs):
            # Extract user from dependency injection
            user = kwargs.get('user')
            if not user:
                raise HTTPException(status_code=401, detail="Unauthorized")

            if not rate_limiter.check_rate_limit(user.id, max_requests, window_seconds):
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded: {max_requests} requests per {window_seconds} seconds"
                )

            return await func(*args, **kwargs)
        return wrapper
    return decorator
```

Usage in endpoints:

```python
from pixsim7.backend.main.middleware.rate_limit import rate_limit

@router.post("/{world_id}/advance", response_model=GameWorldDetail)
@rate_limit(max_requests=60, window_seconds=60)  # 1 per second
async def advance_world_time(
    world_id: int,
    req: AdvanceWorldTimeRequest,
    game_world_service: GameWorldSvc,
    user: CurrentUser,
) -> GameWorldDetail:
    # ... implementation
    pass

@router.patch("/{session_id}", response_model=GameSessionResponse)
@rate_limit(max_requests=120, window_seconds=60)  # 2 per second
async def update_session(
    session_id: int,
    req: SessionUpdateRequest,
    game_session_service: GameSessionSvc,
    user: CurrentUser,
) -> GameSessionResponse:
    # ... implementation
    pass
```

**Note**: For production, use Redis-based rate limiting (e.g., `slowapi` or `fastapi-limiter` libraries).

---

## Summary Statistics

| Severity | Count | Key Concerns |
|----------|-------|--------------|
| High     | 1     | Race condition in time advancement |
| Medium   | 8     | Data consistency, security, scalability |
| Low      | 11    | Performance, UX, observability |
| **Total**| **20**| |

## Recommended Implementation Order

1. **High Priority** (Security & Data Integrity):
   - Issue #1: Race condition in world time advancement
   - Issue #2: Orphaned world state on transaction failure
   - Issue #3: No world ownership validation

2. **Medium Priority** (System Health):
   - Issue #5: Unbounded session events table
   - Issue #20: Rate limiting
   - Issue #18: Transaction management

3. **Low Priority** (Polish & Optimization):
   - Issue #9: Version increment optimization
   - Issue #11: Pagination
   - Issue #12: Observability logging

4. **Documentation** (Can be done in parallel):
   - Issue #6: World time wrapping semantics
   - Issue #10: API consistency documentation

---

**Document Version**: 1.0
**Last Updated**: 2025-12-02
