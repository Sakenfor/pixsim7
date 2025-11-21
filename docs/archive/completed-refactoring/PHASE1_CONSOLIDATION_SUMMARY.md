# Phase 1 Consolidation Summary

**Date:** 2025-11-16
**Phase:** Architecture Simplification - Phase 1
**Status:** ✅ Complete

## Overview

Successfully consolidated the standalone `pixsim7_game_service` into the main `pixsim7.backend.main` as a modular game module. This eliminates the need for a separate game service, removes HTTP calls between services, and simplifies the architecture into a modular monolith.

## Changes Made

### 1. Domain Models Moved
**Location:** `pixsim7/backend/main/domain/game/`

Moved all game domain models from `pixsim7_game_service/domain/models.py`:
- `GameScene` - Scene graph structure
- `GameSceneNode` - Individual nodes in scenes
- `GameSceneEdge` - Connections between nodes with conditions/effects
- `GameSession` - Player session state
- `GameSessionEvent` - Session history/events
- `GameLocation` - World locations
- `GameNPC` - Non-player characters
- `NPCSchedule` - NPC schedules
- `NPCState` - Runtime NPC state

### 2. Services Migrated
**Location:** `pixsim7/backend/main/services/game/`

- `GameSessionService` - Converted from sync to async to match backend pattern
  - Uses `AsyncSession` instead of `Session`
  - All methods are now async
  - Integrated with backend database session management

### 3. API Routes Consolidated
**Location:** `pixsim7/backend/main/api/v1/`

Created new game API routes:
- `game_scenes.py` - Scene retrieval with asset hydration
  - **Endpoint:** `GET /api/v1/game/scenes/{scene_id}`
  - **Changed:** Uses `AssetService` directly instead of HTTP client
  - **Benefit:** No network hop, direct database access, better performance

- `game_sessions.py` - Session management
  - **Endpoints:**
    - `POST /api/v1/game/sessions/` - Create session
    - `GET /api/v1/game/sessions/{session_id}` - Get session
    - `POST /api/v1/game/sessions/{session_id}/advance` - Advance session

### 4. Direct Service Integration
**Key Improvement:** Replaced HTTP-based asset fetching with direct service calls

**Before (Game Service):**
```python
# Used HTTP client to fetch assets
asset = await fetch_asset(asset_id, authorization_header=authorization)
```

**After (Consolidated Backend):**
```python
# Direct service call, no HTTP overhead
asset = await asset_service.get_asset_for_user(asset_id, user)
```

**Benefits:**
- Eliminates network latency
- Removes need for auth header forwarding
- Simpler error handling
- Single database connection pool
- Better transaction support

### 5. Database Migration
**File:** `pixsim7/backend/main/infrastructure/database/migrations/versions/20251116_1000_add_game_tables.py`

Created Alembic migration to add all game tables to the main backend database:
- All game scene tables
- Session tracking tables
- World/NPC tables

### 6. Dependency Injection
**File:** `pixsim7/backend/main/api/dependencies.py`

Added game service dependency:
```python
def get_game_session_service(db: AsyncSession = Depends(get_database)) -> GameSessionService:
    """Get GameSessionService instance"""
    return GameSessionService(db)

GameSessionSvc = Annotated[GameSessionService, Depends(get_game_session_service)]
```

### 7. Main App Integration
**File:** `pixsim7/backend/main/main.py`

- Imported game domain models in startup (for SQLModel registration)
- Added game routers:
  - `/api/v1/game/scenes` → game_scenes router
  - `/api/v1/game/sessions` → game_sessions router

## Architecture Improvements

### Before
```
┌─────────────────┐     HTTP      ┌──────────────────┐
│                 │  ──────────>   │                  │
│  Game Service   │                │  Content Backend │
│  (Port 8002)    │  <──────────   │  (Port 8001)     │
│                 │   Auth/Assets  │                  │
└─────────────────┘                └──────────────────┘
  │                                  │
  ├─ Own DB Session                 ├─ AssetService
  ├─ Own FastAPI App                ├─ JobService
  ├─ HTTP Client                    ├─ UserService
  └─ Imports backend auth           └─ ...
```

### After
```
┌────────────────────────────────────────┐
│     Unified PixSim7 Backend            │
│     (Port 8001)                        │
│                                        │
│  ┌──────────────┐  ┌───────────────┐  │
│  │ Content      │  │ Game          │  │
│  │ Domain       │  │ Domain        │  │
│  │ - Assets     │  │ - Scenes      │  │
│  │ - Jobs       │  │ - Sessions    │  │
│  │ - Users      │  │ - World/NPCs  │  │
│  └──────────────┘  └───────────────┘  │
│                                        │
│  Shared:                               │
│  - Single DB Pool                      │
│  - Single FastAPI App                  │
│  - Direct Service Calls                │
│  - Common Auth                         │
└────────────────────────────────────────┘
```

## Benefits Achieved

1. **Simpler Deployment** - One service instead of two
2. **Reduced Latency** - Direct service calls instead of HTTP
3. **Better Transactions** - Single database session for cross-domain operations
4. **Cleaner Auth** - No auth token forwarding needed
5. **Easier Development** - One codebase to run and debug
6. **Modular Design** - Game logic still isolated in clear module boundaries
7. **Future-Proof** - Can be split back out if scaling requires it (Phase 6)

## API Compatibility

### New Endpoints
- `GET /api/v1/game/scenes/{scene_id}` - Get scene with nodes/edges/assets
- `POST /api/v1/game/sessions/` - Create new game session
- `GET /api/v1/game/sessions/{session_id}` - Get session state
- `POST /api/v1/game/sessions/{session_id}/advance` - Advance session via edge

### Response Format
All responses maintain compatibility with `@pixsim7/types.Scene` schema from the frontend.

## Next Steps (Phase 2)

According to `ARCHITECTURE_SIMPLIFICATION_PLAN.md`:
1. Normalize auth & boundaries
2. Create shared auth claims type
3. Reduce game → user domain coupling
4. Keep game code in logical layer

## Files Changed

**Created:**
- `pixsim7/backend/main/domain/game/__init__.py`
- `pixsim7/backend/main/domain/game/models.py`
- `pixsim7/backend/main/services/game/__init__.py`
- `pixsim7/backend/main/services/game/game_session_service.py`
- `pixsim7/backend/main/api/v1/game_scenes.py`
- `pixsim7/backend/main/api/v1/game_sessions.py`
- `pixsim7/backend/main/infrastructure/database/migrations/versions/20251116_1000_add_game_tables.py`

**Modified:**
- `pixsim7/backend/main/api/dependencies.py` - Added GameSessionService dependency
- `pixsim7/backend/main/main.py` - Added game model imports and routers

**Not Yet Modified (Future Work):**
- `pixsim7_game_service/*` - Kept for reference, can be archived later (Phase 1.4)
- Frontend game API client - Needs to point to new endpoints (Phase 3)

## Testing Notes

To test the consolidated routes:
1. Run the main backend: `uvicorn pixsim7.backend.main.main:app`
2. Create a game scene with nodes and edges in the database
3. Test endpoints:
   - `GET /api/v1/game/scenes/{id}` - Should return scene with hydrated assets
   - `POST /api/v1/game/sessions/` - Should create session
   - `POST /api/v1/game/sessions/{id}/advance` - Should update session state

## Migration Status

- ✅ Domain models moved
- ✅ Services migrated to async
- ✅ API routes created with direct service integration
- ✅ Database migration created
- ✅ Main app integration complete
- ⏳ Migration needs to be run: `alembic upgrade head`
- ⏳ Frontend needs updating to use new endpoints
- ⏳ Old game service can be archived after validation
