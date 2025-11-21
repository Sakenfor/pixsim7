# Optimistic Session Updates + Versioning Implementation

## Overview

This document describes the implementation of client-side optimistic updates with backend versioning for the PixSim7 game session management system. The system maintains backend authority while providing instant UI feedback for better user experience.

## Architecture

### Backend Changes

#### 1. Database Schema
- **File**: `pixsim7/backend/main/domain/game/models.py`
- **Migration**: `20251118_0000_add_session_versioning.py`
- Added `version: int` field to `GameSession` model (default=1)
- Version is incremented automatically on each update

#### 2. API Endpoints
- **File**: `pixsim7/backend/main/api/v1/game_sessions.py`

**Request Changes**:
```python
class SessionUpdateRequest(BaseModel):
    world_time: Optional[float] = None
    flags: Optional[Dict[str, Any]] = None
    relationships: Optional[Dict[str, Any]] = None
    expected_version: Optional[int] = None  # New field
```

**Response Changes**:
```python
class GameSessionResponse(BaseModel):
    # ... existing fields ...
    version: int  # New field
```

**Conflict Handling**:
- If `expected_version` is provided and doesn't match current version, returns `409 Conflict`
- Response includes current session state for conflict resolution:
```json
{
  "error": "version_conflict",
  "message": "Session was modified by another process",
  "current_session": { /* full session data */ }
}
```

#### 3. Service Layer
- **File**: `pixsim7/backend/main/services/game/game_session_service.py`

**Version Checking**:
```python
async def update_session(
    self,
    *,
    session_id: int,
    expected_version: Optional[int] = None,
    # ... other params ...
) -> GameSession:
    # Check version for optimistic locking
    if expected_version is not None and session.version != expected_version:
        raise ValueError("version_conflict")

    # Apply updates...

    # Increment version
    session.version += 1
```

**Optimization - Write-Only Normalization**:
- Relationship normalization (`_normalize_session_relationships`) now only runs on write operations
- Removed from `get_session()` to avoid redundant computation
- Frontend uses cached values or computes locally as fallback
- Normalization still runs on:
  - `create_session()`
  - `update_session()`
  - `advance_session()`

### Frontend Changes

#### 1. Type Definitions
- **File**: `packages/types/src/game.ts`

```typescript
export interface GameSessionDTO {
  // ... existing fields ...
  version: number; // New field - optimistic locking version
}
```

#### 2. API Client
- **File**: `frontend/src/lib/api/game.ts`

**New Response Type**:
```typescript
export interface SessionUpdateResponse {
  session?: GameSessionDTO;
  conflict?: boolean;
  serverSession?: GameSessionDTO;
}
```

**Conflict Detection**:
```typescript
export async function updateGameSession(
  sessionId: number,
  payload: {
    world_time?: number;
    flags?: Record<string, unknown>;
    relationships?: Record<string, unknown>;
    expected_version?: number; // New field
  },
): Promise<SessionUpdateResponse> {
  try {
    const res = await apiClient.patch<GameSessionDTO>(...);
    return { session: res.data, conflict: false };
  } catch (error: any) {
    if (error.response?.status === 409) {
      const detail = error.response.data?.detail;
      if (detail?.error === 'version_conflict') {
        return {
          conflict: true,
          serverSession: detail.current_session,
        };
      }
    }
    throw error;
  }
}
```

#### 3. Session Adapter
- **File**: `frontend/src/lib/game/interactions/sessionAdapter.ts`

**Optimistic Update Pattern**:
```typescript
const applyOptimisticUpdate = async (
  localUpdate: (session: GameSessionDTO) => GameSessionDTO,
  backendUpdate: Partial<GameSessionDTO>
): Promise<GameSessionDTO> => {
  // 1. Optimistic update (instant UI)
  const optimistic = localUpdate(gameSession);
  onUpdate?.(optimistic);

  // 2. Backend validation (if API available)
  if (api) {
    try {
      const response = await api.updateSession(gameSession.id, {
        ...backendUpdate,
        expectedVersion: gameSession.version, // Include version
      });

      // 3a. Handle version conflicts
      if (response.conflict && response.serverSession) {
        console.log('[SessionAdapter] Version conflict detected, resolving...');

        // Re-apply local changes on top of server state
        const resolved = await resolveConflict(
          gameSession,
          response.serverSession,
          localUpdate
        );

        // Retry with new version
        const retryResponse = await api.updateSession(gameSession.id, {
          ...backendUpdate,
          expectedVersion: response.serverSession.version,
        });

        if (retryResponse.session) {
          onUpdate?.(retryResponse.session);
          return retryResponse.session;
        }
      }

      // 3b. No conflict - apply server truth
      if (response.session) {
        onUpdate?.(response.session);
        return response.session;
      }
    } catch (err) {
      // 3c. Rollback on error
      console.error('[SessionAdapter] Update failed, rolling back:', err);
      onUpdate?.(gameSession);
      throw err;
    }
  }

  return optimistic;
};
```

**Conflict Resolution Strategy**:
- Last-write-wins with merge
- Re-applies local changes on top of server state
- Retries update with new version

#### 4. Integration with Game2D
- **File**: `frontend/src/routes/Game2D.tsx`

**SessionAPI Wiring**:
```typescript
session: createSessionHelpers(
  gameSession,
  (updatedSession) => setGameSession(updatedSession), // onUpdate callback
  {
    updateSession: (sessionId, updates) => updateGameSession(sessionId, updates),
  } satisfies SessionAPI // API for backend sync
),
```

## Data Flow

### Successful Update Flow
```
1. User Action (e.g., updateNpcRelationship)
   ↓
2. Apply optimistic update to local state (instant UI)
   ↓
3. Send to backend with current version
   ↓
4. Backend validates and increments version
   ↓
5. Return updated session with new version
   ↓
6. Apply server truth to local state
```

### Conflict Resolution Flow
```
1. User Action
   ↓
2. Apply optimistic update to local state
   ↓
3. Send to backend with version N
   ↓
4. Backend detects version mismatch (server has version N+1)
   ↓
5. Backend returns 409 Conflict with current session state
   ↓
6. Frontend logs conflict
   ↓
7. Re-apply local changes on top of server state
   ↓
8. Retry update with new version (N+1)
   ↓
9. Apply final server truth to local state
```

### Rollback Flow
```
1. User Action
   ↓
2. Apply optimistic update to local state
   ↓
3. Send to backend
   ↓
4. Backend returns error (network, validation, etc.)
   ↓
5. Frontend logs error and rolls back to original state
   ↓
6. User sees error notification
```

## Session Helpers Using Optimistic Updates

All session helper methods use the optimistic update pattern:

- `updateNpcRelationship(npcId, patch)` - Update NPC relationship stats
- `addInventoryItem(itemId, quantity)` - Add items to inventory
- `removeInventoryItem(itemId, quantity)` - Remove items from inventory
- `updateArcStage(arcId, stage)` - Progress narrative arcs
- `markSceneSeen(arcId, sceneId)` - Mark scenes as viewed
- `updateQuestStatus(questId, status)` - Update quest status
- `incrementQuestSteps(questId, increment)` - Progress quest objectives
- `triggerEvent(eventId)` - Start game events
- `endEvent(eventId)` - End game events

## Performance Optimizations

### 1. Write-Only Normalization
- Relationship normalization (computing tierId, intimacyLevelId) only happens on writes
- Reads use cached values from Redis (60s TTL)
- Frontend computes values locally if missing (fallback)
- Reduces redundant computation on frequent reads

### 2. Redis Caching
- Normalized relationship data cached with 60s TTL
- Cache automatically refreshed on writes
- Reduces database load and computation time

### 3. Optimistic UI Updates
- Instant feedback on user actions
- No waiting for server round-trip
- Better perceived performance

## Testing Strategy

### Manual Testing Checklist

1. **Single User Updates**
   - [ ] Update NPC relationship → UI updates instantly → backend confirms
   - [ ] Add inventory item → UI updates instantly → backend confirms
   - [ ] Update quest status → UI updates instantly → backend confirms

2. **Version Conflict Simulation**
   - [ ] Open same session in two tabs/devices
   - [ ] Make update in Tab A
   - [ ] Make conflicting update in Tab B
   - [ ] Verify Tab B detects conflict and resolves correctly
   - [ ] Check console logs for conflict resolution messages

3. **Error Handling**
   - [ ] Disconnect network
   - [ ] Make update (should apply optimistically)
   - [ ] Wait for backend error
   - [ ] Verify rollback to original state
   - [ ] Reconnect network and retry

4. **Performance**
   - [ ] Make rapid succession of updates
   - [ ] Verify UI remains responsive
   - [ ] Check that updates batch correctly
   - [ ] Verify final state matches backend

### Automated Testing (Future)

```typescript
describe('Optimistic Updates', () => {
  it('should apply updates optimistically', async () => {
    // Test instant UI update
  });

  it('should handle version conflicts', async () => {
    // Test conflict detection and resolution
  });

  it('should rollback on errors', async () => {
    // Test error handling
  });
});
```

## Migration Guide

### Database Migration

Run the migration to add the version field:

```bash
# Check current migration status
alembic current

# Run migration
alembic upgrade head

# Verify migration
alembic history
```

### Frontend Updates

The frontend changes are backward compatible:
- If backend doesn't have version field, optimistic updates still work
- Version checking is optional (only when `expected_version` is provided)
- Existing code continues to work without changes

### Rollback Plan

If issues arise, rollback is safe:

1. **Backend**: Run `alembic downgrade 1117unifygenmodel`
2. **Frontend**: The frontend gracefully handles missing version field
3. **No data loss**: Version field is additive, removing it doesn't break existing data

## Future Enhancements

1. **Conflict Resolution UI**
   - Show users when conflicts occur
   - Allow manual conflict resolution
   - Display diff between local and server state

2. **Offline Support**
   - Queue updates when offline
   - Replay when connection restored
   - Handle complex conflict scenarios

3. **Advanced Caching**
   - Longer cache TTLs with invalidation
   - Client-side caching layer
   - Optimistic cache updates

4. **Analytics**
   - Track conflict frequency
   - Monitor rollback rate
   - Measure perceived performance improvement

## References

- [Optimistic UI Updates - React Patterns](https://kentcdodds.com/blog/optimistic-ui)
- [Conflict-Free Replicated Data Types (CRDTs)](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type)
- [Optimistic Locking vs Pessimistic Locking](https://stackoverflow.com/questions/129329/optimistic-vs-pessimistic-locking)

## Recent Improvements (Latest Update)

### 1. Retry Limit with Exponential Backoff
- **Problem**: Infinite retry loops possible on persistent conflicts
- **Solution**: Max 3 retries with exponential backoff (100ms, 200ms, 400ms)
- **Benefit**: Prevents resource exhaustion while allowing legitimate retries

### 2. Performance Optimization via Memoization
- **Problem**: `sessionHelpers` recreated on every render in Game2D
- **Solution**: Added `useMemo` for `sessionAPI` and `sessionHelpers`
- **Benefit**: Reduces unnecessary object creation and re-renders

### 3. Type Safety for Updates
- **Problem**: `Partial<GameSessionDTO>` allows updating readonly fields (id, user_id, etc.)
- **Solution**: Created `SessionUpdatePayload` type with only mutable fields
- **Benefit**: Compile-time prevention of invalid updates

### 4. Improved Logging
- **Problem**: Raw `console.log` everywhere, not production-ready
- **Solution**: Created structured logger with dev/prod awareness
- **Benefit**: Better debugging, ready for integration with logging services

### 5. Explicit Cache Invalidation
- **Problem**: Redis cache could become stale from external updates
- **Solution**: Invalidate cache explicitly before re-normalization on writes
- **Benefit**: Guarantees fresh computation after updates

## Summary

This implementation provides:
- ✅ Instant UI feedback (optimistic updates)
- ✅ Backend authority (version checking)
- ✅ Automatic conflict resolution with retry limits
- ✅ Error handling with rollback
- ✅ Performance optimization (write-only normalization + memoization)
- ✅ Type safety (SessionUpdatePayload prevents invalid updates)
- ✅ Explicit cache invalidation (prevents stale data)
- ✅ Production-ready logging
- ✅ Graceful degradation (works without backend support)
- ✅ Future-ready (offline support foundation)

The system maintains data consistency while dramatically improving perceived performance and user experience.
