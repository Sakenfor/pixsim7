# Core API Routes Plugin System

This directory contains core API route plugins that are auto-discovered and loaded at application startup.

## Overview

Core routes are the fundamental API endpoints for PixSim7:
- **Authentication & users** (auth, users)
- **Assets & lineage** (assets, lineage, tags)
- **Generation & prompts** (generations, prompts, semantic_packs, action_blocks)
- **Game systems** (characters, game_sessions, game_worlds, game_scenes, etc.)
- **Admin & diagnostics** (admin, admin_plugins, logs, services, migrations, database)
- **Dev tools** (dev_* routes for internal tooling)

## Directory Structure

```
routes/
  auth/               # Authentication endpoints
    __init__.py
    manifest.py
  users/              # User management
    __init__.py
    manifest.py
  assets/             # Asset management
    __init__.py
    manifest.py
  ... (and more)
```

## How It Works

1. **Auto-Discovery**: Routes are discovered from this directory at startup
2. **Manifest-Based**: Each route has a `manifest.py` defining metadata
3. **Router Reference**: Manifests reference existing routers from `api/v1/`
4. **Dependency Resolution**: Routes can depend on other routes (e.g., `users` depends on `auth`)
5. **Auto-Registration**: Routes are registered with FastAPI automatically

## Route vs Plugin

**Routes** (`pixsim7/backend/main/routes/`)
- Core API functionality
- Essential for application operation
- Represents stable, production-ready endpoints
- Examples: auth, users, assets

**Plugins** (`pixsim7/backend/main/plugins/`)
- Optional feature extensions
- Game mechanics and experimental features
- Can be enabled/disabled independently
- Examples: game-stealth, game-npcs, game-dialogue

Both use the **same plugin infrastructure** (`infrastructure/plugins/manager.py`)

## Creating a New Route Plugin

### 1. Create Directory

```bash
mkdir pixsim7/backend/main/routes/my_feature
```

### 2. Create Manifest

Create `manifest.py`:

```python
"""
My Feature API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.my_feature import router

manifest = PluginManifest(
    id="my_feature",
    name="My Feature API",
    version="1.0.0",
    description="My awesome feature endpoints",
    author="Your Name",
    prefix="/api/v1",
    tags=["my-feature"],
    dependencies=["auth"],  # Optional: depends on auth
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
```

### 3. Create `__init__.py`

```python
from .manifest import manifest, router
__all__ = ["manifest", "router"]
```

### 4. Create Your Router

Create `api/v1/my_feature.py` with your actual endpoints:

```python
from fastapi import APIRouter
from pixsim7.backend.main.api.dependencies import CurrentUser

router = APIRouter()

@router.get("/my-feature/items")
async def get_items(user: CurrentUser):
    return {"items": []}
```

### 5. Restart Application

Your route will be auto-discovered and registered!

## Route Dependencies

Routes can depend on other routes:

```python
manifest = PluginManifest(
    id="lineage",
    dependencies=["auth", "assets"],  # Requires auth and assets routes
    # ...
)
```

The plugin manager ensures routes load in the correct order.

## Disabling Routes

To temporarily disable a route, set `enabled=False` in the manifest:

```python
manifest = PluginManifest(
    id="my_feature",
    enabled=False,  # Route will not be loaded
    # ...
)
```

## Available Routes

Current core routes are defined by directory name under `routes/`.
See each `manifest.py` for descriptions, tags, and dependencies.

Core routes:
`accounts`, `action_blocks`, `admin`, `admin_plugins`, `ai`, `analyses`, `analytics`,
`analyzers`, `assets`, `auth`, `automation`, `behavior_registry`, `character_graph`,
`characters`, `database`, `device_agents`, `dialogue_analytics`, `game_behavior`,
`game_inventory`, `game_locations`, `game_npc_mood_preview`, `game_quests`,
`game_reputation_preview`, `game_scenes`, `game_sessions`, `game_worlds`,
`generations`, `interactions`, `lineage`, `llm_cache`, `logs`, `media`, `migrations`,
`npc_state`, `pixverse_sync`, `plugins`, `prompts`,
`prompts_git`, `providers`, `semantic_packs`, `services`, `stat_preview`,
`tags`, `users`, `websocket`

Dev tool routes:
`dev_ai_models`, `dev_architecture`, `dev_block_fit`, `dev_info`, `dev_ontology`,
`dev_pixverse_sync`, `dev_prompt_categories`, `dev_prompt_import`,
`dev_prompt_inspector`, `dev_prompt_library`, `dev_prompt_timeline`

## Lifecycle Hooks

Routes support optional lifecycle hooks in their `manifest.py`:

```python
def on_load(app):
    """Called when route is loaded (before app starts)"""
    logger.info("My route loaded")

async def on_enable():
    """Called when route is enabled (after app starts)"""
    logger.info("My route enabled")

async def on_disable():
    """Called when route is disabled (before shutdown)"""
    logger.info("My route disabled")
```

## Troubleshooting

### Route not loading
- Check that `manifest.py` exists and exports `manifest` and `router`
- Verify route ID matches directory name
- Check logs for error messages

### Wrong load order
- Use `dependencies` to specify route dependencies
- Routes with dependencies load after their dependencies

### Import errors
- Ensure router exists in `api/v1/`
- Check for circular imports
- Verify all required modules are installed

## See Also

- [Plugins System](../plugins/README.md) - For feature plugins
- [Middleware System](../middleware/README.md) - For HTTP middleware
- [Event Handlers](../event_handlers/README.md) - For event processing
