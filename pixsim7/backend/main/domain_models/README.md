# Domain Model Registry

This directory contains domain model packages that are auto-discovered and registered with SQLModel for database schema creation.

## Overview

Instead of manually importing 20+ domain models in `main.py`, the domain model registry:
- **Auto-discovers** model packages from this directory
- **Imports models** in the correct order based on dependencies
- **Registers** them with SQLModel/SQLAlchemy automatically

## Directory Structure

```
domain_models/
  ├── core_models/          # Core business models
  │   ├── __init__.py
  │   └── manifest.py
  ├── automation_models/    # Android automation models
  │   ├── __init__.py
  │   └── manifest.py
  └── game_models/          # Game domain models
      ├── __init__.py
      └── manifest.py
```

## How It Works

1. **Auto-Discovery**: Packages are discovered from this directory at startup
2. **Manifest-Based**: Each package defines which models to register
3. **Model Import**: Models are imported from existing `domain/` modules
4. **Dependency Resolution**: Packages load in correct order
5. **SQLModel Registration**: Models are registered for schema creation

## Current Packages

### core_models
**Models:** User, UserSession, Asset, Job, Workspace, etc. (14 models)
**Dependencies:** None (base models)
**Purpose:** Core business domain models

### automation_models
**Models:** AndroidDevice, AppActionPreset, AutomationExecution, etc. (5 models)
**Dependencies:** `core_models` (references User)
**Purpose:** Android automation domain models

### game_models
**Models:** GameScene, GameNPC, GameSession, GameLocation, etc. (9 models)
**Dependencies:** `core_models` (references User, Asset)
**Purpose:** Game mechanics domain models

## Creating a New Model Package

### 1. Create Directory

```bash
mkdir pixsim7/backend/main/domain_models/my_models
```

### 2. Create Manifest

Create `manifest.py`:

```python
"""
My Domain Models Package
"""

from pixsim7.backend.main.infrastructure.domain_registry import DomainModelManifest

# Import models from your domain module
from pixsim7.backend.main.domain.my_domain import (
    MyModel1,
    MyModel2,
)

# Manifest
manifest = DomainModelManifest(
    id="my_models",
    name="My Domain Models",
    description="Description of my models",
    models=[
        "MyModel1",
        "MyModel2",
    ],
    enabled=True,
    dependencies=["core_models"],  # Optional: depends on other packages
)
```

### 3. Create `__init__.py`

```python
from .manifest import manifest

__all__ = ["manifest"]
```

### 4. Restart Application

Your models will be auto-discovered and registered!

## Model Dependencies

Packages can depend on other packages to ensure correct load order:

```python
manifest = DomainModelManifest(
    id="game_models",
    dependencies=["core_models"],  # Loaded after core_models
    # ...
)
```

**Load order:** `core_models` → `automation_models` / `game_models`

## Disabling Model Packages

To temporarily disable a package, set `enabled=False`:

```python
manifest = DomainModelManifest(
    id="my_models",
    enabled=False,  # Models will not be registered
    # ...
)
```

## Important Notes

### Do NOT Move Domain Modules

This system **references** existing domain modules (`domain/`, `domain/automation/`, `domain/game/`). It does NOT replace them.

**Structure:**
```
domain/                  # Actual model definitions (DO NOT MOVE)
  ├── user.py
  ├── asset.py
  ├── automation/
  └── game/

domain_models/          # Registry manifests (references models above)
  ├── core_models/
  ├── automation_models/
  └── game_models/
```

### Model Registration Order

Models MUST be registered before `init_database()` is called. The domain registry handles this automatically during app startup.

## Before vs After

**Before:**
```python
# main.py - 37 lines of imports!
from pixsim7.backend.main.domain import (
    User,
    UserSession,
    UserQuotaUsage,
    Workspace,
    Asset,
    AssetVariant,
    Job,
    # ... 15 more models
)
from pixsim7.backend.main.domain.automation import (
    AndroidDevice,
    # ... 5 more models
)
from pixsim7.backend.main.domain.game import (
    GameScene,
    # ... 9 more models
)
```

**After:**
```python
# main.py - 3 lines!
from pixsim7.backend.main.infrastructure.domain_registry import init_domain_registry
domain_registry = init_domain_registry("pixsim7/backend/main/domain_models")
logger.info(f"Registered {len(domain_registry.registered_models)} domain models")
```

## Troubleshooting

### Models not registered
- Check that `manifest.py` exists in the package directory
- Verify `manifest` is exported from `__init__.py`
- Check logs for error messages
- Ensure models are imported in the manifest

### Wrong load order
- Use `dependencies` to specify package dependencies
- Packages with dependencies load after their dependencies

### Import errors
- Verify models exist in the domain module
- Check for circular imports
- Ensure all required packages are installed

## See Also

- [Routes Plugin System](../routes/README.md) - For API route plugins
- [Middleware Plugin System](../middleware/README.md) - For HTTP middleware
- [Feature Plugins](../plugins/README.md) - For game mechanics and features
