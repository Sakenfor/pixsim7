# Game Domain

This module contains the game-related domain models and business logic.

## Architecture Boundaries

The game domain is designed to be **loosely coupled** from other domains to enable potential future extraction into a separate service if scaling requires it.

### ✅ Allowed Dependencies

**Within game module:**
- `domain/game/` → Game domain models only
- `services/game/` → Game domain models + database session

**Cross-domain (minimal):**
- `api/v1/game_*.py` → Can use:
  - `api/dependencies` (CurrentUser, AssetSvc, DatabaseSession, GameSessionSvc)
  - `domain/game` models
  - `services/game` services

**AssetService usage:**
- Game scenes can fetch assets via `AssetService` (this is acceptable cross-domain dependency)
- Assets are referenced by ID in game models
- Asset fetching happens in API layer, not service layer

### ❌ Forbidden Dependencies

Game code **must NOT** import from:
- `services/provider/` - Provider adapters (RunwayML, Haiper, etc.)
- `services/job/` - Job orchestration
- `api/v1/admin.py` - Admin routes
- `domain/account.py` - Provider accounts
- `domain/job.py` - Job models

### Service Design Pattern

Game services should accept **simple types** instead of full domain models where possible:

**✅ Good (decoupled):**
```python
class GameSessionService:
    async def create_session(self, *, user_id: int, scene_id: int) -> GameSession:
        # Uses user_id (int) instead of User model
        session = GameSession(user_id=user_id, ...)
```

**❌ Avoid (coupled):**
```python
class GameSessionService:
    async def create_session(self, *, user: User, scene_id: int) -> GameSession:
        # Couples service to User domain model
        session = GameSession(user_id=user.id, ...)
```

### Shared Types

For cross-domain use, prefer lightweight types from `shared/`:
- `AuthClaims` - Decoded JWT payload
- `UserContext` - Minimal user identity

## Domain Models

### Scene Graph
- `GameScene` - Root scene with entry node
- `GameSceneNode` - Individual nodes (references assets by ID)
- `GameSceneEdge` - Connections with conditions/effects

### Session Management
- `GameSession` - Player session state
- `GameSessionEvent` - Session history/audit log

### World (Future)
- `GameLocation` - World locations
- `GameNPC` - Non-player characters
- `NPCSchedule` - NPC schedules
- `NPCState` - Runtime NPC state

## Future Extraction

If game logic needs to scale independently, this clean boundary design enables easy extraction:

1. Copy `domain/game/` and `services/game/` to new service
2. Keep API contract (`/api/v1/game/*`) as-is
3. Add lightweight HTTP layer between services for asset fetching
4. Shared types (`AuthClaims`, `UserContext`) remain common

See: `ARCHITECTURE_SIMPLIFICATION_PLAN.md` Phase 6
