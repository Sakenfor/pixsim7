# PixSim7 Repository Map

This document describes the organization principles for the PixSim7 backend and frontend codebases.

## Directory Structure

```
pixsim7/backend/main/
├── api/v1/              # API endpoints (FastAPI routers)
├── domain/              # Domain models and business entities
│   ├── assets/          # Asset domain package
│   ├── generation/      # Generation domain package
│   ├── ontology/        # Ontology concepts and registry
│   ├── providers/       # Provider models and schemas
│   ├── game/            # Game simulation domain
│   ├── narrative/       # Narrative and action blocks
│   ├── metrics/         # Metrics and evaluators
│   ├── core/            # Core cross-domain utilities
│   └── *.py             # Cross-cutting primitives (enums, links, etc.)
├── services/            # Business logic and orchestration
│   ├── asset/           # Asset services (CRUD, lineage, sync)
│   ├── generation/      # Generation services
│   ├── provider/        # Provider adapters and orchestration
│   └── ...              # Other service modules
├── shared/              # Cross-cutting utilities only
├── providers/           # Provider plugin manifests
└── infrastructure/      # Database, external service clients
```

## Domain Ownership Policy

### 1. Domain Code Location

**All domain models belong under `domain/<domain>/`:**

| Domain | Location | Contents |
|--------|----------|----------|
| Assets | `domain/assets/` | Asset, AssetVariant, AssetLineage, AssetBranch, Tag, etc. |
| Generation | `domain/generation/` | Generation, ActionBlockDB, BlockImageFit |
| Ontology | `domain/ontology/` | OntologyRegistry, ConceptRef, pose/mood definitions |
| Providers | `domain/providers/` | Provider models, schemas, registry |
| Game | `domain/game/` | Character, NPC, ECS system |
| Narrative | `domain/narrative/` | Story engine, action block generators |

**The `domain/` root should only contain true cross-domain primitives:**
- `enums.py` - Shared enumerations (MediaType, OperationType, etc.)
- `links.py` - Entity linking utilities
- Temporary shim modules for backward compatibility (deprecated)

### 2. Service Layer

**`services/` owns orchestration and business logic:**

- Services may import from `domain/` (read domain models)
- Services should NOT be imported by `domain/` (one-way dependency)
- Each service focuses on a specific capability (e.g., `asset/lineage_service.py`)

### 3. API Layer

**`api/v1/` owns HTTP endpoints:**

- DTOs and request/response schemas stay in API layer
- API handlers delegate to services
- API layer should not contain business logic

### 4. Shared Utilities

**`shared/` is for truly cross-cutting concerns only:**

- Authentication utilities (`auth.py`, `jwt_helpers.py`)
- Configuration (`config.py`)
- Logging and debugging utilities
- **NOT** for domain-specific code

### 5. Provider Plugins

**Three-layer provider architecture:**

| Layer | Location | Purpose |
|-------|----------|---------|
| Domain | `domain/providers/` | Provider models, schemas, registry |
| Services | `services/provider/` | Adapter orchestration, execution |
| Plugins | `providers/` | Provider manifests and configuration |

**One-way dependency:** `domain/providers/` should NOT import from `services/provider/`.

## Backward Compatibility

During the transition, shim modules provide backward compatibility:

```python
# Old import (deprecated):
from pixsim7.backend.main.domain.asset import Asset

# New import (preferred):
from pixsim7.backend.main.domain.assets import Asset
```

Shim modules will be removed in a future version. New code should use the canonical imports.

## Import Conventions

```python
# Domain models
from pixsim7.backend.main.domain.assets import Asset, AssetLineage
from pixsim7.backend.main.domain.generation import Generation, ActionBlockDB
from pixsim7.backend.main.domain.ontology import get_ontology_registry, match_keywords

# Services
from pixsim7.backend.main.services.asset import AssetCoreService
from pixsim7.backend.main.services.generation import GenerationService

# Shared utilities
from pixsim7.backend.main.shared.config import get_settings
```

## Migration Notes

### Ontology

- **Single source of truth:** `domain/ontology/`
- **Data file:** `domain/ontology/data/ontology.yaml`
- `shared/ontology.py` is deprecated - use `domain.ontology` imports

### Assets Services

- **Canonical location:** `services/asset/`
- `services/assets/` is deprecated - all code moved to `services/asset/`

### Domain Packages

- Asset modules moved to `domain/assets/`
- Generation modules moved to `domain/generation/`
- Old locations contain re-export shims for backward compatibility

## Frontend (apps/main) Overview

Key areas for UI, panels, and capability plumbing:

- `apps/main/src/lib/dockview/` - SmartDockview wrapper, dockview hosts, add-panel API, context menu integration.
- `apps/main/src/features/panels/` - Panel registry, scopes, settings resolver, panel manager, panel metadata.
- `apps/main/src/features/contextHub/` - Runtime capabilities (providers/consumers), scope hosts, capability descriptors, unified facade.
- `apps/main/src/lib/capabilities/` - App capability catalog (features/routes/actions/states) for discovery and permissions.
- `apps/main/src/features/workspace/` - Workspace dockview and panel layout orchestration.
- `apps/main/src/features/controlCenter/` - Control center dockview and quick generation UI.
- `apps/main/src/features/assets/` - Asset viewer panels, sources, and asset-related state.
- `apps/main/src/features/settings/` - Panel settings UI, panel-centric settings, schema rendering.

Notes:
- SmartDockview wraps each panel instance with a `ContextHubHost` and applies scope providers based on panel metadata.
- Capabilities are exposed through ContextHub for runtime panel communication, with a facade that merges app registry metadata.
- Related docs: `docs/architecture/dockview.md`, `docs/architecture/clean-coupling-strategy.md`.
