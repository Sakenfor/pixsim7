# ADR: Extension Architecture

- **Date:** 2025-11-21
- **Status:** Accepted
- **Authors:** PixSim7 Team

---

## Context

PixSim7 needed a way to add new functionality without modifying core systems or creating tight coupling. The system has multiple extension needs:

1. **Backend extensibility** - Add API routes, domain models, behaviors, middleware
2. **Frontend extensibility** - Add UI overlays, dev tools, workspace utilities
3. **Game extensibility** - Add custom behaviors, scoring, NPC logic
4. **Editor extensibility** - Add custom node renderers and templates

### Constraints

- Must work within monorepo structure (`pixsim7_backend/`, `frontend/`, `game-frontend/`)
- Must not require modifying core `main.py` or root app files
- Must support hot-reload in development
- Must allow third-party extensions (not just first-party features)
- Extension state should be clear: DB tables vs JSON vs client-only

### Alternatives Considered

1. **Monolithic Approach**
   - Add all features directly to core codebase
   - ❌ Rejected: Creates tight coupling, harder to test, breaks single responsibility

2. **Microservices**
   - Split into separate services
   - ❌ Rejected: Too much operational overhead for current scale, deployment complexity

3. **Pure Plugin System (loaded from external packages)**
   - Load plugins from pip packages or npm packages
   - ❌ Rejected: Adds dependency management complexity, harder to version control

4. **Unified Extension Architecture (chosen)**
   - Multiple extension surfaces with clear contracts
   - In-repo extensions for first-party, with hooks for external
   - ✅ Accepted: Balance between modularity and simplicity

---

## Decision

PixSim7 implements a **unified extension architecture** with multiple extension surfaces:

### Extension Types

1. **Backend Route Plugins**
   - Location: `pixsim7_backend/routes/<feature>/manifest.py`
   - Purpose: Add HTTP/WebSocket endpoints
   - Auto-discovered and registered at startup
   - Example: Admin panel routes, log ingestion

2. **Backend Domain Plugins**
   - Location: `pixsim7_backend/domain_models/<feature>_models/manifest.py`
   - Purpose: Add new SQLModel domain types
   - Migrated via Alembic
   - Example: Extended game entities

3. **Backend Behavior Plugins**
   - Location: Registries in services (e.g., `behavior_registry`)
   - Purpose: Add NPC conditions, effects, metrics, scoring
   - Registered at module import time
   - Example: Custom NPC behaviors, game mechanics

4. **Backend Middleware Plugins**
   - Location: `pixsim7_backend/infrastructure/middleware/`
   - Purpose: Request/response cross-cutting concerns
   - Applied to FastAPI app
   - Example: Logging, auth, rate limiting

5. **Frontend UI Plugins**
   - Location: `apps/main/src/lib/plugins/`, `plugins/`
   - Purpose: User-installable UI overlays and tools
   - Loaded dynamically, can be enabled/disabled
   - Example: Dev tools, debug panels, custom overlays

6. **Graph Node Renderers**
   - Location: `apps/main/src/lib/graph/nodeRendererRegistry.ts`
   - Purpose: Custom scene/quest node visuals in editor
   - Registered in renderer registry
   - Example: Custom node types for specific game mechanics

7. **Game/World JSON Extensions**
   - Location: `GameSession.flags`, `GameSession.relationships`, world `meta`
   - Purpose: Game rules, quest state, relationships without new DB tables
   - Validated against JSON schemas
   - Example: Custom flags, relationship types, game state

### Key Principles

**We ARE:**
- Using manifest-based discovery for backend plugins
- Keeping extensions in-repo initially (easier version control)
- Using registries for behavioral extensions
- Storing game extension state in JSON (not DB tables)
- Providing clear extension points with documented contracts

**We are NOT:**
- Loading plugins from external packages (yet)
- Creating a marketplace or plugin store
- Supporting arbitrary plugin formats
- Allowing plugins to override core system behavior directly

### Extension State Guidelines

| State Type | Storage | Example |
|------------|---------|---------|
| Core domain | PostgreSQL tables | User, Job, Asset, Scene |
| Extension domain | PostgreSQL tables (via domain plugins) | Custom game entities |
| Game state | JSON (`GameSession.flags`, etc.) | Quest progress, relationships |
| UI preferences | Client localStorage | Panel layouts, theme |
| Temporary | Redis cache | Session data, rate limits |

---

## Consequences

### Positive

1. **Modularity**
   - New features can be added without modifying core systems
   - Easier to test extensions in isolation
   - Clear boundaries between core and extensions

2. **Discoverability**
   - Manifest-based discovery means no manual registration in `main.py`
   - Registries provide introspection capabilities
   - Clear extension points documented in one place

3. **Flexibility**
   - Multiple extension surfaces for different use cases
   - Can choose appropriate extension type based on needs
   - Game state in JSON allows rapid iteration without migrations

4. **Maintainability**
   - Extensions follow consistent patterns
   - Easy to identify what's core vs extension
   - Can deprecate or remove extensions without affecting core

### Trade-offs

1. **Complexity**
   - Multiple extension types to understand
   - Need to choose right extension surface for each feature
   - Documentation burden to explain all surfaces

2. **Performance**
   - Manifest discovery has startup cost (mitigated by caching)
   - Registry lookups have small overhead
   - JSON validation for game state

3. **Versioning**
   - Extension API changes can break plugins
   - Need to maintain backwards compatibility
   - In-repo means all extensions version together (for now)

### Risks & Mitigation

**Risk:** Extension API instability
- **Mitigation:** Document contracts clearly, version extension APIs, use semantic versioning

**Risk:** Extension conflicts
- **Mitigation:** Namespacing, clear priority/ordering rules, validation

**Risk:** Performance degradation with many extensions
- **Mitigation:** Lazy loading, caching, profiling, plugin disable mechanisms

### Migration Strategy

This is a new system, so no migration needed. Future extensions should:
1. Follow the documented patterns in `EXTENSION_ARCHITECTURE.md`
2. Add ADRs for new extension surfaces
3. Update extension registry documentation

---

## Related Code / Docs

### Code
- Backend route discovery: `pixsim7_backend/routes/*/manifest.py`
- Domain plugin structure: `pixsim7_backend/domain_models/*/manifest.py`
- Behavior registries: Throughout `pixsim7_backend/services/`
- Frontend plugin system: `apps/main/src/lib/plugins/`
- Graph renderer registry: `apps/main/src/lib/graph/nodeRendererRegistry.ts`

### Docs
- **`ARCHITECTURE.md`** - System overview
- **`EXTENSION_ARCHITECTURE.md`** - Detailed extension guide
- **`PLUGIN_DEVELOPER_GUIDE.md`** - How to create plugins
- **`GAMEPLAY_SYSTEMS.md`** - Game state and JSON conventions
- **`docs/APP_MAP.md`** - Application structure

### Related ADRs
- None (this is the foundational ADR for extensions)
