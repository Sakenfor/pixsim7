# Handoff: Backend Plugin System Implementation

## Context

**Project:** PixSim7 - Life simulation game with 2D interactions, NPC relationships, and narrative engine

**What we built:** Dynamic backend plugin system for API routers to enable:
- Modular backend features
- Auto-discovery (no main.py edits)
- Future: Community plugins with sandboxing

**Related:** Frontend also has plugin system at `frontend/src/lib/plugins/` for UI-only user plugins

---

## What Was Built

### 1. Core Plugin Infrastructure

**Location:** `pixsim7_backend/infrastructure/plugins/`

**Files:**
- `types.py` (150 lines) - PluginManifest, BackendPlugin protocol, event system
- `manager.py` (250 lines) - PluginManager with auto-discovery, dependency resolution, lifecycle
- `__init__.py` - Exports

**Key types:**
```python
class PluginManifest(BaseModel):
    id: str
    name: str
    version: str
    prefix: str = "/api/v1"
    tags: list[str] = []
    dependencies: list[str] = []
    enabled: bool = True
    permissions: list[str] = []  # Future: sandboxing

class PluginManager:
    discover_plugins(plugin_dir) -> list[str]
    load_plugin(plugin_name, plugin_dir) -> bool
    resolve_dependencies() -> list[str]  # Topological sort
    register_all() -> None
    async enable_all() -> None
    async disable_all() -> None
```

### 2. Example Plugin Conversion

**Location:** `pixsim7_backend/plugins/game_stealth/`

**Files:**
- `manifest.py` - Converted from `api/v1/game_stealth.py` to plugin format
- `__init__.py` - Exports

**Shows:**
- How to convert existing router to plugin
- Lifecycle hooks (on_load, on_enable, on_disable)
- Dependency declaration

### 3. Documentation

**Location:** `docs/BACKEND_PLUGIN_MIGRATION.md` (500 lines)

**Covers:**
- Migration guide (before/after)
- Plugin template
- Event system usage
- Future sandboxing approach

---

## File Structure

```
pixsim7_backend/
  ├── infrastructure/
  │   └── plugins/          ← NEW
  │       ├── __init__.py
  │       ├── types.py
  │       └── manager.py
  │
  ├── plugins/              ← NEW (plugin directory)
  │   └── game_stealth/
  │       ├── __init__.py
  │       └── manifest.py
  │
  ├── api/
  │   └── v1/
  │       └── game_stealth.py   ← OLD (can be removed after migration)
  │
  └── main.py               ← NEEDS UPDATE

docs/
  ├── BACKEND_PLUGIN_MIGRATION.md  ← NEW
  └── PLUGIN_SYSTEM_ARCHITECTURE.md ← Frontend plugin docs
```

---

## What Needs To Be Done

### Task 1: Integrate into main.py

**File:** `pixsim7_backend/main.py`

**Current state:**
```python
# OLD - Hardcoded imports
from pixsim7_backend.api.v1 import (
    auth, users, jobs, assets, admin, services, accounts,
    providers, lineage, logs, automation, device_agents,
    game_scenes, game_sessions, game_locations, game_npcs,
    game_worlds, game_dialogue, game_stealth  # ← Manual import
)

app.include_router(game_stealth.router, prefix="/api/v1", tags=["game-stealth"])
# ... repeat for all routers
```

**What to add:**
```python
# In lifespan() function, after existing startup code:

from pixsim7_backend.infrastructure.plugins import init_plugin_manager

async def lifespan(app: FastAPI):
    # ... existing startup code (database, redis, providers, etc.) ...

    # Initialize plugin system
    plugin_manager = init_plugin_manager(app, "pixsim7_backend/plugins")
    logger.info(f"Loaded {len(plugin_manager.list_plugins())} plugins")

    # Enable all plugins
    await plugin_manager.enable_all()

    logger.info("PixSim7 ready!")

    yield

    # Shutdown
    logger.info("Shutting down PixSim7...")
    await plugin_manager.disable_all()  # NEW
    await close_redis()
    await close_database()
    logger.info("Cleanup complete")
```

**Test:**
1. Add the code above
2. Restart server
3. Check logs for: "Loaded 1 plugins" (game_stealth)
4. Test pickpocket endpoint: `POST /api/v1/game/stealth/pickpocket`
5. Should work exactly as before!

**Note:** Can keep old imports for now (backward compatible). Remove after all routers migrated.

---

### Task 2: Create plugins/ Directory (Already Done)

**Location:** `pixsim7_backend/plugins/game_stealth/`

**Structure:**
```
plugins/
  └── game_stealth/
      ├── __init__.py
      └── manifest.py
```

Already created as example. To add more plugins, follow this pattern.

---

### Task 3: Migrate Other Routers (Optional)

**Candidates for migration:**
- `game_dialogue` → `plugins/game_dialogue/`
- `game_locations` → `plugins/game_locations/`
- `game_npcs` → `plugins/game_npcs/`
- `game_sessions` → `plugins/game_sessions/`
- etc.

**Template for conversion:**

```python
# plugins/my_feature/manifest.py

from fastapi import APIRouter
from pixsim7_backend.infrastructure.plugins.types import PluginManifest

manifest = PluginManifest(
    id="my-feature",
    name="My Feature",
    version="1.0.0",
    description="Description here",
    prefix="/api/v1",
    tags=["my-feature"],
    dependencies=[],  # Other plugin IDs if needed
    enabled=True,
)

router = APIRouter(prefix="/my-feature", tags=["my-feature"])

@router.get("/endpoint")
def my_endpoint():
    return {"message": "Hello"}

# Optional lifecycle hooks
def on_load(app):
    """Called when plugin loads (before app starts)"""
    pass

async def on_enable():
    """Called after app starts"""
    pass

async def on_disable():
    """Called before shutdown"""
    pass
```

**Then create `plugins/my_feature/__init__.py`:**
```python
from .manifest import manifest, router

__all__ = ['manifest', 'router']
```

**That's it!** Auto-discovered on next startup.

---

## Key Design Decisions

### 1. Plugin Discovery

**Auto-discovery pattern:**
- Scan `pixsim7_backend/plugins/` directory
- Look for `*/manifest.py` files
- Import and validate
- Register with FastAPI

**Why:** No main.py edits needed for new features

### 2. Dependency Resolution

**Topological sort:**
- Plugins declare dependencies
- Manager resolves load order
- Prevents circular dependencies

**Why:** Complex features can depend on base features (e.g., combat depends on sessions)

### 3. Lifecycle Hooks

**Three phases:**
- `on_load(app)` - Setup (before startup)
- `on_enable()` - Start tasks (after startup)
- `on_disable()` - Cleanup (before shutdown)

**Why:** Plugins can manage resources properly

### 4. Event System

**Hook pattern:**
- Plugins subscribe to events
- Core emits events
- Decoupled communication

**Why:** Plugins can react to game events without tight coupling

### 5. Permission System (Future)

**Already in manifest:**
```python
permissions: list[str] = []  # e.g., ["db:read", "db:write"]
```

**Why:** Future-proof for sandboxed community plugins

---

## Architecture Comparison

### Frontend Plugin System

**Location:** `frontend/src/lib/plugins/`

**Purpose:** UI-only user plugins
- Read game state
- Add overlays/UI
- Cannot modify game state
- Fully sandboxed

**Example:** Relationship tracker overlay

### Backend Plugin System

**Location:** `pixsim7_backend/plugins/`

**Purpose:** API router modules
- Full access (for now)
- Can modify DB/state
- Built-in features
- Future: Community plugins with permissions

**Example:** Pickpocket mechanics

### How They Work Together

```
Frontend Plugin (relationship-tracker)
    ↓ reads state
Frontend PluginAPI (read-only)
    ↓ calls
Backend API (/api/v1/game/sessions)
    ↓ served by
Backend Plugin (game-sessions)
    ↓ modifies
Database
```

**Future:** Frontend plugin calls backend plugin:
```
Frontend Plugin (dice-game UI)
    ↓ calls
Backend Plugin API (/api/v1/dice-game/roll)
    ↓ served by
Backend Plugin (dice-game)
```

---

## Testing Checklist

After integrating:

- [ ] Server starts without errors
- [ ] Logs show "Loaded 1 plugins"
- [ ] Pickpocket endpoint still works
- [ ] OpenAPI docs show `/game/stealth/pickpocket`
- [ ] No regression in existing features

After adding new plugin:

- [ ] Plugin auto-discovered on startup
- [ ] Endpoints accessible
- [ ] Dependencies load in correct order
- [ ] Lifecycle hooks called

---

## Common Issues

### Plugin Not Loading

**Symptom:** "Discovered 0 plugins"

**Fix:**
- Check `plugins/` directory exists
- Check `manifest.py` exists in plugin subdirectory
- Check manifest exports `manifest` and `router`

### Import Errors

**Symptom:** "Failed to load plugin: No module named..."

**Fix:**
- Ensure plugin uses absolute imports
- Check Python path includes project root

### Circular Dependencies

**Symptom:** "Circular dependency detected: A -> B -> A"

**Fix:**
- Remove circular dependency
- Restructure to use events instead of direct imports

---

## Reference Files

**Full examples:**
- `plugins/game_stealth/manifest.py` - Complete plugin with hooks
- `docs/BACKEND_PLUGIN_MIGRATION.md` - Detailed migration guide
- `infrastructure/plugins/manager.py` - Plugin manager implementation

**Related docs:**
- `docs/PLUGIN_SYSTEM_ARCHITECTURE.md` - Frontend plugin architecture
- `docs/PLUGIN_DEVELOPER_GUIDE.md` - Frontend plugin API reference

---

## Next Steps Priority

**Priority 1:** Integrate plugin manager into main.py (30 minutes)
- Add to lifespan startup
- Test with game_stealth
- Verify no regressions

**Priority 2:** Migrate 1-2 more routers (1 hour)
- Convert game_dialogue or game_locations
- Validate auto-discovery works
- Test dependencies

**Priority 3:** Remove old imports (15 minutes)
- Once all migrated, clean up main.py
- Remove manual router imports

**Priority 4:** Add event emissions (optional)
- Emit events from core endpoints
- Allow plugins to subscribe

---

## Summary for Another Claude

**What we built:**
A dynamic backend plugin system that auto-discovers API routers, resolves dependencies, and manages lifecycle. Mirrors the frontend plugin architecture.

**Why:**
- No main.py edits for new features
- Cleaner architecture
- Future-proof for community plugins

**Current state:**
- Infrastructure complete
- Example conversion (game_stealth) done
- Documentation written
- Ready to integrate into main.py

**Next task:**
Add plugin manager to main.py lifespan function (code provided above in Task 1).

**Files to review:**
- `infrastructure/plugins/manager.py` - Core logic
- `plugins/game_stealth/manifest.py` - Example plugin
- `docs/BACKEND_PLUGIN_MIGRATION.md` - Full guide
