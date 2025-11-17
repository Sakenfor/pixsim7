
# Backend Plugin System - Migration Guide

## Overview

The backend now supports **dynamic plugin loading** for API routers. This makes it easy to:

- ✅ Add new API modules without editing main.py
- ✅ Enable/disable features via config
- ✅ Resolve dependencies automatically
- ✅ Hot reload during development
- ✅ Future: Load community plugins

---

## Quick Start

### 1. Update main.py

**Before (Hardcoded):**

```python
# main.py - OLD
from pixsim7_backend.api.v1 import (
    auth, users, jobs, assets, admin, services, accounts,
    providers, lineage, logs, automation, device_agents,
    game_scenes, game_sessions, game_locations, game_npcs,
    game_worlds, game_dialogue, game_stealth
)

app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(users.router, prefix="/api/v1", tags=["users"])
# ... 20 more lines
app.include_router(game_stealth.router, prefix="/api/v1", tags=["game-stealth"])
```

**After (Dynamic):**

```python
# main.py - NEW
from pixsim7_backend.infrastructure.plugins import init_plugin_manager

# In lifespan startup
async def lifespan(app: FastAPI):
    # ... existing startup code ...

    # Initialize plugin system
    plugin_manager = init_plugin_manager(app, "pixsim7_backend/plugins")
    logger.info(f"Loaded {len(plugin_manager.list_plugins())} plugins")

    # Enable all plugins
    await plugin_manager.enable_all()

    yield

    # Shutdown
    await plugin_manager.disable_all()
```

**That's it!** No more manual router imports.

---

## 2. Convert Router to Plugin

### Old Structure

```
api/v1/
  ├── game_stealth.py    # Router definition
  └── ...
```

### New Structure

```
plugins/
  ├── game_stealth/
  │   ├── __init__.py
  │   └── manifest.py    # Plugin definition
  └── custom_feature/
      ├── __init__.py
      └── manifest.py
```

### Migration Example

**Before (api/v1/game_stealth.py):**

```python
from fastapi import APIRouter

router = APIRouter(prefix="/game/stealth", tags=["game-stealth"])

@router.post("/pickpocket")
def attempt_pickpocket(req):
    # ...
```

**After (plugins/game_stealth/manifest.py):**

```python
from fastapi import APIRouter
from pixsim7_backend.infrastructure.plugins.types import PluginManifest

# Define manifest
manifest = PluginManifest(
    id="game-stealth",
    name="Game Stealth & Pickpocket",
    version="1.0.0",
    description="Provides stealth mechanics",
    prefix="/api/v1",
    tags=["game-stealth"],
    enabled=True,
)

# Define router (same as before)
router = APIRouter(prefix="/game/stealth", tags=["game-stealth"])

@router.post("/pickpocket")
def attempt_pickpocket(req):
    # ... same code

# Optional lifecycle hooks
def on_load(app):
    """Called when plugin loads"""
    print("Stealth plugin loaded")

async def on_enable():
    """Called when plugin enables"""
    print("Stealth plugin enabled")

async def on_disable():
    """Called when plugin disables"""
    print("Stealth plugin disabled")
```

**plugins/game_stealth/__init__.py:**

```python
from .manifest import manifest, router, on_load, on_enable, on_disable

__all__ = ['manifest', 'router', 'on_load', 'on_enable', 'on_disable']
```

---

## 3. Create New Plugin

### Template

```bash
mkdir -p pixsim7_backend/plugins/my_feature
```

**plugins/my_feature/manifest.py:**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pixsim7_backend.db import get_db
from pixsim7_backend.infrastructure.plugins.types import PluginManifest

# Manifest
manifest = PluginManifest(
    id="my-feature",
    name="My Feature",
    version="1.0.0",
    description="Does something cool",
    author="Your Name",
    prefix="/api/v1",
    tags=["my-feature"],
    dependencies=[],  # List other plugin IDs if needed
    requires_db=True,
    requires_redis=False,
    enabled=True,
)

# Router
router = APIRouter(prefix="/my-feature", tags=["my-feature"])

@router.get("/hello")
def hello_world():
    return {"message": "Hello from my plugin!"}

@router.post("/do-something")
def do_something(db: Session = Depends(get_db)):
    # Your logic here
    return {"success": True}

# Lifecycle hooks (optional)
def on_load(app):
    """Setup that doesn't require runtime state"""
    pass

async def on_enable():
    """Start background tasks, connect to services, etc."""
    pass

async def on_disable():
    """Cleanup, stop tasks, etc."""
    pass
```

**plugins/my_feature/__init__.py:**

```python
from .manifest import manifest, router

__all__ = ['manifest', 'router']
```

**That's it!** Plugin will be auto-discovered and loaded.

---

## Plugin Features

### Dependencies

Plugins can depend on other plugins:

```python
manifest = PluginManifest(
    id="game-combat",
    dependencies=["game-sessions", "game-npcs"],  # Must load after these
)
```

The plugin manager automatically resolves load order via topological sort.

### Enable/Disable

```python
# Disable a plugin
manifest = PluginManifest(
    id="experimental-feature",
    enabled=False,  # Won't be registered
)
```

Or at runtime:
```python
# In config.yaml or env var
DISABLED_PLUGINS=experimental-feature,beta-api
```

### Lifecycle Hooks

```python
def on_load(app: FastAPI):
    """
    Called when plugin loads (BEFORE app starts).
    Use for: Setup, validation, registration.
    """
    app.state.my_plugin_data = {}

async def on_enable():
    """
    Called when plugin enables (AFTER app starts).
    Use for: Background tasks, service connections.
    """
    asyncio.create_task(my_background_task())

async def on_disable():
    """
    Called when plugin disables (BEFORE app shuts down).
    Use for: Cleanup, closing connections.
    """
    await close_connections()
```

---

## Event System (Hooks)

Plugins can subscribe to events:

```python
from pixsim7_backend.infrastructure.plugins import plugin_hooks, PluginEvents

# In on_enable()
async def on_session_created(session_id: int):
    print(f"New session: {session_id}")

plugin_hooks.register(PluginEvents.SESSION_CREATED, on_session_created)
```

**Emit events:**

```python
# In game session endpoint
await plugin_hooks.emit(PluginEvents.SESSION_CREATED, session.id)
```

**Available events:**

```python
class PluginEvents:
    # Lifecycle
    PLUGIN_LOADED = "plugin:loaded"
    PLUGIN_ENABLED = "plugin:enabled"
    PLUGIN_DISABLED = "plugin:disabled"

    # Game events
    SESSION_CREATED = "session:created"
    SESSION_UPDATED = "session:updated"
    INTERACTION_EXECUTED = "interaction:executed"
    NPC_SPAWNED = "npc:spawned"
    LOCATION_CHANGED = "location:changed"

    # System
    APP_STARTUP = "app:startup"
    APP_SHUTDOWN = "app:shutdown"
```

---

## Migration Checklist

- [ ] Add plugin system to main.py lifespan
- [ ] Create `pixsim7_backend/plugins/` directory
- [ ] Convert `game_stealth` to plugin (example provided)
- [ ] Convert other API modules one by one
- [ ] Test plugin loading and dependencies
- [ ] Update deployment scripts if needed

---

## Benefits

### Before

```python
# To add new feature:
1. Create api/v1/my_feature.py
2. Edit main.py to import it
3. Edit main.py to register router
4. Repeat for every feature
```

### After

```python
# To add new feature:
1. Create plugins/my_feature/manifest.py
2. Done! Auto-discovered and loaded
```

---

## Advanced: Sandboxed Plugins (Future)

The system is designed to support **community plugins** later:

```python
manifest = PluginManifest(
    id="community-plugin",
    permissions=["db:read"],  # Can read DB but not write
)

# Plugin runs in restricted environment
@router.get("/data")
def get_data(db: Session = Depends(get_db_readonly)):  # Read-only
    # Cannot modify data
    return {"data": [...]}
```

**Security features (future):**
- Permission system (db:read, db:write, redis:read, etc.)
- Rate limiting per plugin
- Sandboxed execution
- Code review process

---

## Example: Full Plugin

See `pixsim7_backend/plugins/game_stealth/` for complete example.

**Key files:**
- `manifest.py` - Plugin definition, router, hooks
- `__init__.py` - Exports

**Usage:**
```bash
# Plugin is auto-loaded on startup
curl http://localhost:8000/api/v1/game/stealth/pickpocket -X POST -d '{...}'
```

---

## Troubleshooting

### Plugin not loading

Check logs:
```
INFO: Discovered 5 plugins: ['game_stealth', 'my_feature', ...]
INFO: Loaded plugin: Game Stealth v1.0.0
ERROR: Failed to load plugin my_feature: ...
```

Common issues:
- Missing `manifest.py` in plugin directory
- Manifest doesn't export `manifest` or `router`
- Syntax error in plugin code
- Missing dependencies

### Circular dependencies

```
ERROR: Circular dependency detected: game-combat -> game-npcs -> game-combat
```

Fix by removing circular dependency or restructuring.

### Plugin disabled

```
INFO: Skipping disabled plugin: experimental-feature
```

Check `manifest.enabled = True` or remove from `DISABLED_PLUGINS`.

---

## Summary

**What changed:**
- ✅ Dynamic plugin loading
- ✅ Auto-discovery
- ✅ Dependency resolution
- ✅ Lifecycle hooks
- ✅ Event system

**What stayed the same:**
- ✅ FastAPI routers work exactly as before
- ✅ No changes to endpoints or logic
- ✅ Just better organization

**Future possibilities:**
- 🔮 Community plugins
- 🔮 Hot reload (dev mode)
- 🔮 Plugin marketplace
- 🔮 Sandboxed execution
