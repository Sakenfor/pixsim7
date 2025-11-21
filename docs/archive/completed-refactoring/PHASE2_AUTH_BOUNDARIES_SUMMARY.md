# Phase 2: Normalize Auth & Boundaries Summary

**Date:** 2025-11-16
**Phase:** Architecture Simplification - Phase 2
**Status:** ✅ Complete

## Overview

Completed Phase 2 of the architecture simplification plan. Established clean authentication patterns and domain boundaries to reduce coupling between game logic and other backend domains. This ensures the game module remains loosely coupled and can be extracted later if needed.

## Changes Made

### 1. Shared Auth Claims Type
**File:** `pixsim7/backend/main/shared/auth_claims.py`

Created lightweight authentication types for cross-domain use:

**AuthClaims** - Decoded JWT token payload
```python
class AuthClaims(BaseModel):
    user_id: int
    token_id: str  # jti
    email: Optional[str] = None
    username: Optional[str] = None
    is_admin: bool = False
    exp: Optional[datetime] = None
```

**UserContext** - Minimal user identity for domain services
```python
class UserContext(BaseModel):
    user_id: int
    is_admin: bool = False
```

**Benefits:**
- Services can use simple types instead of full ORM models
- Reduces coupling between domains
- Makes domain boundaries explicit
- Easier to split services later

### 2. Service Design Pattern (Already Implemented ✓)

Verified that `GameSessionService` already follows best practices:

**✅ Current Implementation:**
```python
class GameSessionService:
    async def create_session(self, *, user_id: int, scene_id: int) -> GameSession:
        # Accepts user_id (int) instead of User model
        session = GameSession(user_id=user_id, ...)
```

This pattern:
- Decouples game service from User domain model
- Only depends on primitive types (int)
- Service layer doesn't need User ORM knowledge

**API Layer:**
```python
@router.post("/")
async def create_session(
    req: CreateSessionRequest,
    game_session_service: GameSessionSvc,
    user: CurrentUser,  # Auth happens here
):
    # Only pass user.id to service (not full User object)
    gs = await game_session_service.create_session(user_id=user.id, scene_id=req.scene_id)
```

### 3. Domain Boundaries Documentation
**File:** `pixsim7/backend/main/domain/game/README.md`

Created comprehensive documentation for game module boundaries:

**Allowed Dependencies:**
- ✅ Game domain models
- ✅ Database session
- ✅ AssetService (for fetching assets by ID)
- ✅ Shared types (AuthClaims, UserContext)

**Forbidden Dependencies:**
- ❌ Provider adapters (RunwayML, Haiper, etc.)
- ❌ Job orchestration
- ❌ Admin routes
- ❌ Provider accounts
- ❌ Direct User domain coupling

### 4. Boundary Verification

Verified game code imports - **ALL CLEAN** ✅

**Game Module Imports:**
```
domain/game/      → Only imports own models
services/game/    → Only imports domain/game + AsyncSession
api/v1/game_*.py  → Only imports dependencies, game models, AssetService
```

**No forbidden imports found!** Game code does not import from:
- `services/provider/`
- `services/job/`
- `api/v1/admin.py`
- Provider or job domain models

### 5. Shared Module Updates
**File:** `pixsim7/backend/main/shared/__init__.py`

Exported new auth types:
```python
from pixsim7.backend.main.shared.auth_claims import AuthClaims, UserContext

__all__ = [
    "AuthClaims",
    "UserContext",
]
```

## Architecture Improvements

### Clean Layering

```
┌─────────────────────────────────────────────┐
│           API Layer (Routes)                │
│  - Handles authentication (returns User)    │
│  - Extracts user_id, passes to services     │
│  - Uses AssetService for asset hydration    │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│         Service Layer (Business Logic)      │
│  - Accepts simple types (user_id: int)      │
│  - No dependency on User ORM model          │
│  - No dependency on provider/job domains    │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│          Domain Layer (Models)              │
│  - Pure data models (SQLModel)              │
│  - No service dependencies                  │
│  - References to assets via ID only         │
└─────────────────────────────────────────────┘
```

### Dependency Graph

```
game/domain    ← game/services ← game/api
                                    ↓
                            shared/auth_claims
                            api/dependencies
                            (CurrentUser, AssetSvc)
```

**Cross-domain:**
- Game API can use AssetService (acceptable - needs to fetch assets)
- No other cross-domain dependencies

## Design Principles Established

### 1. Accept Simple Types
Services accept primitives (int, str) instead of ORM models when possible.

### 2. Shared Lightweight Types
Use `AuthClaims` and `UserContext` from `shared/` for cross-domain auth context.

### 3. Clear Domain Boundaries
Game code isolated in:
- `domain/game/`
- `services/game/`
- `api/v1/game_*.py`

### 4. Explicit Dependencies
Only acceptable cross-domain dependency: AssetService (for fetching assets by ID).

## Future Benefits

These clean boundaries enable:

1. **Independent Testing** - Game logic can be tested without provider/job infrastructure
2. **Clear Ownership** - Game domain is self-contained
3. **Easy Extraction** - Can split into separate service (Phase 6) with minimal changes
4. **Reduced Cognitive Load** - Developers know exactly what game code can/can't depend on

## Verification Checklist

- ✅ Created shared auth claims types
- ✅ Verified GameSessionService uses user_id (not User model)
- ✅ Checked all imports - no forbidden dependencies
- ✅ Documented domain boundaries
- ✅ Exported shared types
- ✅ Created README for game module

## Next Steps (Phase 3)

According to `ARCHITECTURE_SIMPLIFICATION_PLAN.md`:

**Phase 3 - Simplify Frontend** (READY FOR AGENT)
1. Extract `ScenePlayer` into shared module
2. Remove iframe + postMessage approach
3. Use `ScenePlayer` directly in editor
4. Call unified backend API (`/api/v1/game/*`)

## Files Changed

**Created:**
- `pixsim7/backend/main/shared/auth_claims.py` - AuthClaims and UserContext types
- `pixsim7/backend/main/domain/game/README.md` - Domain boundary documentation

**Modified:**
- `pixsim7/backend/main/shared/__init__.py` - Export auth types

**Verified (no changes needed):**
- `pixsim7/backend/main/services/game/game_session_service.py` - Already uses user_id ✓
- All game imports - Clean boundaries ✓

## Notes

Phase 2 was mostly about verification and documentation. The code structure from Phase 1 already followed good patterns:
- Services accept simple types
- No unwanted cross-domain dependencies
- Clear module boundaries

We formalized these patterns by:
- Creating shared auth types for future use
- Documenting the boundaries explicitly
- Verifying compliance across all game code

This sets a good precedent for other domains and makes the architecture intent explicit.
