# Backend Cleanup Report: Clearer Boundaries and Exports

**Date:** 2025-12-14
**Objective:** Make backend/domain exports explicit and domain-specific; improve DI and registry clarity

---

## Executive Summary

The backend exhibits **good foundational organization** with clear domain boundaries and separated concerns. However, several areas could benefit from refinement to match the frontend's "Types" clarity achieved in recent refactoring:

1. **Generic helpers are well-separated** - mapping infrastructure already extracted
2. **DI patterns are inconsistent** - some services create dependencies internally
3. **Registry initialization uses side-effects** - via plugin hooks and auto-discovery
4. **Shared exports could be more domain-specific** - currently minimal but could grow unchecked

**Key Finding:** The backend is in better shape than the frontend was pre-refactoring, but targeted improvements will prevent future drift.

---

## 1. Current State: Exports and Namespaces

### ✅ Good Practices Already in Place

#### Domain Package (`pixsim7/backend/main/domain/__init__.py`)
- **Excellent documentation** of export conventions (lines 13-42)
- **Clear separation** between core models (exported) and extended subsystems (import from submodules)
- **Explicit `__all__`** list prevents accidental exports

**Current exports:**
```python
# Core cross-cutting models (exported from domain/__init__.py)
- User, UserSession, UserQuotaUsage, UserRole
- Workspace, Asset, Generation, ProviderSubmission
- Scene, LogEntry, PromptFamily, etc.

# Extended subsystems (must import from submodules)
- from pixsim7.backend.main.domain.game import GameWorld
- from pixsim7.backend.main.domain.stats import StatEngine
- from pixsim7.backend.main.domain.narrative import NarrativeEngine
```

**Assessment:** ✅ This is the **gold standard** pattern. Well-documented, clear boundaries.

#### Stats Domain (`pixsim7/backend/main/domain/stats/__init__.py`)
- **Domain-specific namespace** already achieved
- **Comprehensive exports** with clear categories: schemas, engines, registry, helpers
- **148-line `__all__` list** - explicit and complete
- **Registration functions** exported for plugin integration

**Assessment:** ✅ Exemplary domain-specific exports. No changes needed.

#### Game Domain (`pixsim7/backend/main/domain/game/__init__.py`)
- **Clean exports** of models, ECS helpers, state management, interaction types
- **Grouped logically** with comments
- **148 items in `__all__`** - comprehensive

**Assessment:** ✅ Well-organized domain exports.

#### Narrative Domain (`pixsim7/backend/main/domain/narrative/__init__.py`)
- **Clear separation** of legacy vs. new runtime
- **Comprehensive exports** for schemas, ECS helpers, action blocks, integration
- **126 items in `__all__`**

**Assessment:** ✅ Good structure.

### ⚠️ Areas for Improvement

#### Shared Module (`pixsim7/backend/main/shared/__init__.py`)
**Current state:** Minimal exports (only 5 items)
```python
__all__ = [
    "AuthClaims",
    "UserContext",
    "get_backend_logger",
    "get_event_logger",
    "get_plugin_logger",
]
```

**Issue:** The `shared/schemas/` directory contains many schema files (12 files, 1170+ lines) but **NO barrel export**. The `shared/schemas/__init__.py` is **empty**.

**Risk:** Without a clear export strategy, teams may:
- Add feature-specific schemas to `shared/schemas/` that should live in domain modules
- Re-export domain types through shared (creating circular dependencies)
- Create confusion about "shared" vs "domain" boundaries

**Recommendation:**
```python
# shared/schemas/__init__.py should export ONLY truly cross-cutting contracts:
__all__ = [
    # Cross-cutting API contracts
    "GenerationRequest",       # Used by multiple domains
    "AssetMetadataSchema",     # Used by multiple domains
    "TelemetryEvent",          # Cross-cutting observability

    # DO NOT export domain-specific types here
    # ❌ "NPCPromptContext"    # Should be in domain.game
    # ❌ "StatDefinition"       # Should be in domain.stats
]
```

#### Services Module (`pixsim7/backend/main/services/__init__.py`)
**Current state:** Empty file (1 line)

**Assessment:** ✅ This is **correct**. Services should be imported directly from their submodules, not via a barrel export. Services are implementation details, not public APIs.

---

## 2. Generic Mapping/Helpers: Already Well-Separated ✅

### Current Organization

**Generic infrastructure** (entity-agnostic):
- `services/prompt_context/mapping.py` - FieldMapping, set_nested_value, get_nested_value
- `services/prompt_context/__init__.py` - Clean barrel export

**Entity-specific configs** (NPC domain):
- `services/characters/npc_prompt_mapping.py` - NPC_FIELD_MAPPING configuration
- Imports generic helpers from `prompt_context.mapping`

### Assessment
✅ **This is the ideal pattern** recommended by the task description:
> "Move generic helpers (FieldMapping, set_nested_value, get_nested_value) into a neutral module"

**No changes needed.** This was already done in the recent refactoring (commit 70f2d86).

### Why This Works
- **Generic helpers** are reusable across entity types (NPCs, locations, props, buildings)
- **Entity-specific mappings** use the generic infrastructure but live in their domain
- **Clear imports** show dependency direction: domain → generic helpers (not vice versa)

---

## 3. Dependency Injection: Opportunities for Improvement

### Current Patterns

#### ✅ Good DI: Database Sessions
Most services follow this pattern:
```python
class SomeService:
    def __init__(self, db: AsyncSession):
        self.db = db
```
**Assessment:** ✅ Clean, testable, standard FastAPI pattern.

#### ⚠️ Mixed DI: Service Composition
**Example 1:** `PromptContextService` (lines 345-372 of `prompt_context_service.py`)
```python
class PromptContextService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self._register_default_npc_resolver()

    def _register_default_npc_resolver(self):
        # ❌ Creates dependencies internally
        instance_service = CharacterInstanceService(self.db)
        sync_service = CharacterNPCSyncService(self.db)
        stat_engine = StatEngine()  # ❌ No injection
        field_mapping = get_npc_field_mapping()
```

**Problem:**
- Hard to test in isolation (can't mock dependencies)
- Hard to replace StatEngine implementation
- Tight coupling to specific service implementations

**Recommendation:**
```python
class PromptContextService:
    def __init__(
        self,
        db: AsyncSession,
        instance_service: Optional[CharacterInstanceService] = None,
        sync_service: Optional[CharacterNPCSyncService] = None,
        stat_engine: Optional[StatEngine] = None,
    ):
        self.db = db
        # Default to creating services if not provided (backward compatible)
        self.instance_service = instance_service or CharacterInstanceService(db)
        self.sync_service = sync_service or CharacterNPCSyncService(db)
        self.stat_engine = stat_engine or StatEngine()
```

**Benefits:**
- Tests can inject mocks
- Allows different StatEngine implementations
- Backward compatible (defaults maintain current behavior)
- FastAPI Depends() can inject services at route level

#### ⚠️ Stateless Engine Instantiation

**Example:** `StatEngine()` is created ad-hoc in many places:
- `prompt_context_service.py:359`
- `stat_service.py` (not shown but likely)
- Throughout services that need stat computation

**Current assumption:** StatEngine is stateless (no config needed)

**Future risk:** If StatEngine needs configuration (e.g., custom derivation rules, caching), current pattern breaks.

**Recommendation:**
```python
# Option A: Factory pattern (if engine remains simple)
def get_stat_engine() -> StatEngine:
    """Get a configured StatEngine instance."""
    return StatEngine()

# Option B: Singleton pattern (if engine becomes stateful)
_stat_engine: Optional[StatEngine] = None

def get_stat_engine() -> StatEngine:
    """Get the global StatEngine instance."""
    global _stat_engine
    if _stat_engine is None:
        _stat_engine = StatEngine()
    return _stat_engine

# Option C: Full DI (for maximum testability)
# Inject StatEngine via FastAPI Depends() at route level
```

### Specific DI Recommendations by Service

| Service | Current Pattern | Recommendation | Priority |
|---------|----------------|----------------|----------|
| `PromptContextService` | Creates `CharacterInstanceService`, `CharacterNPCSyncService`, `StatEngine` internally | Accept as optional constructor params | Medium |
| `StatService` | Only takes `db` and `redis` | Consider accepting `StatEngine` | Low (if engine stays stateless) |
| `GenerationRetryService` | Takes `creation_service` in constructor ✅ | Good pattern, keep it | N/A |

---

## 4. Registry Organization and Clarity

### Current Registries

#### Stats Package Registry (`domain/stats/package_registry.py`)
**Registration:**
```python
# Centralized registration in domain/stats/__init__.py
def register_core_stat_packages() -> None:
    """Register all core stat packages."""
    from .relationships_package import register_core_relationships_package
    from .personality_package import register_core_personality_package
    # ... etc
    register_core_relationships_package()
    register_core_personality_package()
```

**Initialization:** Via plugin hook in `domain/stats/__init__.py:128-136`
```python
def _on_stat_packages_register(plugin_id: str) -> None:
    """Hook handler for STAT_PACKAGES_REGISTER event."""
    register_core_stat_packages()
```

**Assessment:** ⚠️ **Registration via side-effect imports**
- Hook is registered in `setup_stat_package_hooks()`
- Hook is never called in `main.py` startup flow
- Packages are registered as **side effect of importing stats module**

**Problem:**
- Not explicit in startup flow
- Hard to trace when registration happens
- Testing requires careful import management

**Recommendation:**
```python
# In startup.py, add explicit registration:
def setup_stat_packages() -> int:
    """
    Register core stat packages.

    Returns:
        int: Number of packages registered
    """
    from pixsim7.backend.main.domain.stats import register_core_stat_packages
    register_core_stat_packages()

    from pixsim7.backend.main.domain.stats import list_stat_packages
    packages = list_stat_packages()
    logger.info("stat_packages_registered", count=len(packages))
    return len(packages)

# In main.py lifespan, add after setup_ecs_components():
stat_packages_count = setup_stat_packages()
```

#### Behavior Extension Registry (`infrastructure/plugins/behavior_registry.py`)
**Pattern:** Module-level registry singleton
```python
# Module-level singleton
class BehaviorExtensionRegistry:
    def __init__(self):
        self._conditions: Dict[str, ConditionMetadata] = {}
        self._effects: Dict[str, EffectMetadata] = {}
        # ...

# Global instance
behavior_registry = BehaviorExtensionRegistry()
```

**Locking:** Explicit lock in startup flow (`startup.py:295-327`)
```python
def setup_behavior_registry_lock(plugin_manager, routes_manager) -> dict:
    """Lock behavior extension registry after plugins are loaded."""
    from pixsim7.backend.main.infrastructure.plugins import behavior_registry
    stats = behavior_registry.lock_registry()
    return stats
```

**Assessment:** ✅ **Good pattern with explicit lifecycle**
- Clear registration point (plugins register during load)
- Explicit lock after plugins loaded
- Prevents runtime tampering
- Returns stats for observability

#### Event Handler Registry (`infrastructure/events/handlers.py`)
**Pattern:** Auto-discovery via filesystem scan
```python
def discover_event_handlers(handlers_dir: str) -> list[str]:
    """Discover event handler plugins by scanning directory."""
    # Scans for directories with manifest.py
    # Loads and registers handlers
```

**Registration:** Called in `register_handlers()` which is called from `startup.py:208`

**Assessment:** ⚠️ **Auto-discovery adds magic**
- Handlers registered by presence in directory
- No explicit registration list
- Hard to trace which handlers are loaded
- Testing requires filesystem manipulation

**Recommendation:**
```python
# Option A: Explicit registry (preferred for clarity)
def register_handlers() -> dict:
    """Register event handlers explicitly."""
    handlers = {
        'metrics': 'pixsim7.backend.main.event_handlers.metrics',
        'webhooks': 'pixsim7.backend.main.event_handlers.webhooks',
        'auto_retry': 'pixsim7.backend.main.event_handlers.auto_retry',
    }

    stats = {'loaded': 0, 'failed': 0}
    for name, module_path in handlers.items():
        if load_event_handler_plugin(name, module_path):
            stats['loaded'] += 1
        else:
            stats['failed'] += 1

    return stats

# Option B: Keep auto-discovery but add explicit manifest
# Create event_handlers/registry.py with explicit list
REGISTERED_HANDLERS = [
    'metrics',
    'webhooks',
    'auto_retry',
]
```

### Registry Summary

| Registry | Location | Registration Method | Clarity | Recommendation |
|----------|----------|---------------------|---------|----------------|
| **Stat Packages** | `domain/stats/package_registry.py` | Plugin hook (side-effect) | ⚠️ Implicit | Add explicit `setup_stat_packages()` to startup |
| **Behavior Extensions** | `infrastructure/plugins/behavior_registry.py` | Plugin load + explicit lock | ✅ Good | Keep current pattern |
| **Event Handlers** | `infrastructure/events/handlers.py` | Auto-discovery | ⚠️ Magic | Consider explicit registration list |
| **ECS Components** | `domain/game/ecs.py` | Explicit `register_core_components()` | ✅ Excellent | Keep as model for others |

---

## 5. Proposed Module Structure Changes

### No Major Moves Needed

The current structure is sound. All recommendations are **refinements**, not restructuring.

### Minor Adjustments

#### A. Clarify Shared Schemas Boundary
**File:** `pixsim7/backend/main/shared/schemas/__init__.py`

**Current:** Empty file

**Proposed:**
```python
"""
Cross-cutting API schemas.

IMPORTANT: Only add schemas here if they are:
1. Used by multiple domains (not domain-specific)
2. Part of external API contracts (request/response types)
3. Cross-cutting infrastructure (telemetry, auth, etc.)

Domain-specific schemas belong in their domain:
- Game schemas → domain.game.schemas
- Stat schemas → domain.stats.schemas
- Narrative schemas → domain.narrative.schemas
"""

# Cross-cutting request/response schemas
from .generation_schemas import (
    GenerationRequest,
    GenerationResponse,
    SceneRefSchema,
    PlayerContextSnapshotSchema,
)

# Cross-cutting infrastructure schemas
from .telemetry_schemas import (
    TelemetryEvent,
    MetricSnapshot,
)

# Cross-cutting auth schemas
from .auth_schemas import (
    AuthRequest,
    AuthResponse,
    TokenClaims,
)

__all__ = [
    # Generation (cross-cutting)
    "GenerationRequest",
    "GenerationResponse",
    "SceneRefSchema",
    "PlayerContextSnapshotSchema",
    # Telemetry (cross-cutting)
    "TelemetryEvent",
    "MetricSnapshot",
    # Auth (cross-cutting)
    "AuthRequest",
    "AuthResponse",
    "TokenClaims",
]
```

#### B. Add Explicit Stat Package Registration to Startup
**File:** `pixsim7/backend/main/startup.py`

**Add new function:**
```python
def setup_stat_packages() -> int:
    """
    Register core stat packages.

    Stat packages are plugin-extensible bundles of StatDefinition objects
    (relationships, personality, mood, etc.) that worlds can discover and use.

    Returns:
        int: Number of packages registered

    Why this is a separate function:
    - Makes registration explicit in startup flow
    - Returns count for observability
    - Testable in isolation
    """
    from pixsim7.backend.main.domain.stats import (
        register_core_stat_packages,
        list_stat_packages,
    )

    register_core_stat_packages()
    packages = list_stat_packages()

    logger.info(
        "stat_packages_registered",
        count=len(packages),
        packages=[p.id for p in packages]
    )

    return len(packages)
```

**File:** `pixsim7/backend/main/main.py`

**Add to startup (line ~86, after `setup_ecs_components()`):**
```python
# Setup stat packages
stat_packages_count = setup_stat_packages()
```

---

## 6. DI Changes: Specific Recommendations

### High-Priority: PromptContextService

**File:** `pixsim7/backend/main/services/characters/prompt_context_service.py`

**Current constructor (line 345):**
```python
def __init__(self, db: AsyncSession):
    self.db = db
    self._resolvers: Dict[str, EntityContextResolver] = {}
    self._enrichers: Dict[str, List[EnricherFn]] = {}
    self._register_default_npc_resolver()
```

**Proposed constructor:**
```python
def __init__(
    self,
    db: AsyncSession,
    *,
    instance_service: Optional[CharacterInstanceService] = None,
    sync_service: Optional[CharacterNPCSyncService] = None,
    stat_engine: Optional[StatEngine] = None,
):
    """
    Initialize prompt context service with optional dependency injection.

    Args:
        db: Database session (required)
        instance_service: Character instance service (created if not provided)
        sync_service: NPC sync service (created if not provided)
        stat_engine: Stat computation engine (created if not provided)

    Why DI is optional:
    - Backward compatible with existing code
    - Tests can inject mocks for isolation
    - Allows future configuration (e.g., custom stat engine)
    """
    self.db = db
    self._resolvers: Dict[str, EntityContextResolver] = {}
    self._enrichers: Dict[str, List[EnricherFn]] = {}

    # Store injected or default dependencies
    self._instance_service = instance_service or CharacterInstanceService(db)
    self._sync_service = sync_service or CharacterNPCSyncService(db)
    self._stat_engine = stat_engine or StatEngine()

    self._register_default_npc_resolver()

def _register_default_npc_resolver(self):
    """Register NPC resolver using injected dependencies."""
    field_mapping = get_npc_field_mapping()

    npc_resolver = _NpcContextResolver(
        db=self.db,
        instance_service=self._instance_service,
        sync_service=self._sync_service,
        stat_engine=self._stat_engine,
        field_mapping=field_mapping,
    )

    self.register_resolver("npc", npc_resolver)
```

**Benefits:**
- **Tests** can inject mocks: `PromptContextService(db, stat_engine=MockStatEngine())`
- **Backward compatible**: Existing code works unchanged
- **Future-proof**: Can inject configured StatEngine if needed

### Medium-Priority: StatEngine Factory

**File:** `pixsim7/backend/main/domain/stats/engine.py` (or new `factory.py`)

**Add factory function:**
```python
def create_stat_engine(config: Optional[StatEngineConfig] = None) -> StatEngine:
    """
    Create a configured StatEngine instance.

    Args:
        config: Optional configuration for custom behavior

    Returns:
        StatEngine: Configured engine instance

    Why a factory:
    - Centralizes engine creation
    - Allows future configuration injection
    - Makes testing easier (can mock factory)
    """
    if config:
        # Future: apply custom configuration
        pass

    return StatEngine()
```

**Export in `domain/stats/__init__.py`:**
```python
from .engine import StatEngine, create_stat_engine

__all__ = [
    # ... existing exports ...
    "create_stat_engine",
]
```

---

## 7. Implementation Roadmap

### Phase 1: Documentation and Guardrails (1-2 hours, high value)
✅ **Safe, no code changes**

1. Add boundary documentation to `shared/schemas/__init__.py`
2. Add explicit exports to `shared/schemas/__init__.py` (only cross-cutting types)
3. Document DI patterns in `DEVELOPMENT_GUIDE.md`

### Phase 2: Explicit Registry Initialization (2-3 hours, medium risk)
⚠️ **Requires testing**

1. Add `setup_stat_packages()` to `startup.py`
2. Call `setup_stat_packages()` in `main.py` startup flow
3. Add observability (log package count, package IDs)
4. Test that stat packages are registered correctly

### Phase 3: DI Improvements (4-6 hours, requires careful testing)
⚠️ **Medium risk, high value for testing**

1. Update `PromptContextService.__init__()` to accept optional dependencies
2. Update tests to use dependency injection
3. Add `create_stat_engine()` factory
4. Update documentation with DI examples

### Phase 4: Event Handler Registry Clarity (optional, 2-3 hours)
⚠️ **Low priority, cosmetic improvement**

1. Create `event_handlers/registry.py` with explicit handler list
2. Update `discover_event_handlers()` to validate against registry
3. Add logging for enabled vs. available handlers

---

## 8. Comparison with Frontend "Types" Clarity

### Frontend (Post-Refactoring)
- ✅ Explicit namespace exports (`StatsTypes`, `GenerationContracts`)
- ✅ No generic "types" barrel
- ✅ Domain-specific boundaries clear

### Backend (Current State)
- ✅ Domain packages already have excellent boundaries (`domain/stats`, `domain/game`, `domain/narrative`)
- ✅ Generic helpers already separated (`services/prompt_context/mapping`)
- ⚠️ Some implicit registration (stat packages via hook)
- ⚠️ Some DI could be more explicit (`PromptContextService`)

**Verdict:** Backend is **already closer to the goal** than frontend was pre-refactoring. Targeted improvements will maintain this quality as the codebase grows.

---

## 9. Key Recommendations Summary

### DO (High Priority)
1. ✅ **Add explicit stat package registration** to startup flow
2. ✅ **Document shared schema boundaries** to prevent future drift
3. ✅ **Make PromptContextService DI explicit** for better testability

### CONSIDER (Medium Priority)
4. Add `create_stat_engine()` factory for future configurability
5. Add explicit event handler registry

### DON'T (Anti-Patterns to Avoid)
6. ❌ Don't add domain-specific types to `shared/schemas`
7. ❌ Don't use side-effect imports for registration
8. ❌ Don't create services that are hard to test due to internal dependency creation

---

## Appendix A: File Reference

### Key Files Analyzed
```
pixsim7/backend/main/
├── domain/
│   ├── __init__.py                     # ✅ Excellent core/extended separation
│   ├── stats/__init__.py               # ✅ Domain-specific exports
│   ├── game/__init__.py                # ✅ Domain-specific exports
│   └── narrative/__init__.py           # ✅ Domain-specific exports
│
├── services/
│   ├── __init__.py                     # ✅ Empty (correct)
│   ├── prompt_context/
│   │   ├── mapping.py                  # ✅ Generic infrastructure
│   │   └── __init__.py                 # ✅ Clean exports
│   └── characters/
│       ├── npc_prompt_mapping.py       # ✅ Entity-specific config
│       └── prompt_context_service.py   # ⚠️ Needs DI improvement
│
├── shared/
│   ├── __init__.py                     # ✅ Minimal exports
│   └── schemas/
│       └── __init__.py                 # ⚠️ Empty, needs boundaries
│
├── infrastructure/
│   ├── plugins/
│   │   ├── __init__.py                 # ✅ Clear exports
│   │   └── behavior_registry.py        # ✅ Good pattern
│   └── events/
│       └── handlers.py                 # ⚠️ Auto-discovery magic
│
├── startup.py                          # ⚠️ Missing stat package setup
└── main.py                             # ⚠️ Missing stat package call
```

### Lines of Code Impact
- **Phase 1:** ~50 lines (documentation)
- **Phase 2:** ~30 lines (startup registration)
- **Phase 3:** ~50 lines (DI refactor)
- **Total:** ~130 lines of targeted improvements

---

## Appendix B: Testing Checklist

### Before Implementation
- [ ] All existing tests pass
- [ ] No circular import issues

### Phase 1 (Documentation)
- [ ] `shared/schemas/__init__.py` exports only cross-cutting types
- [ ] No domain-specific types in `shared/schemas`

### Phase 2 (Registry)
- [ ] `setup_stat_packages()` logs correct package count
- [ ] All 7 core packages are registered (relationships, personality, mood, resources, drives, behavior_urgency, conversation_style)
- [ ] Package registration happens before plugins load
- [ ] Tests can register packages independently

### Phase 3 (DI)
- [ ] `PromptContextService` works with default dependencies (backward compatible)
- [ ] `PromptContextService` accepts injected dependencies (tests can mock)
- [ ] `StatEngine` can be created via factory
- [ ] All services using `StatEngine` can be tested in isolation

---

## Conclusion

The backend architecture is **fundamentally sound** with clear domain boundaries and good separation of concerns. The recommended changes are **refinements** that will:

1. **Prevent future drift** by documenting boundaries
2. **Improve testability** via explicit DI
3. **Increase observability** via explicit registration

These changes are **low-risk** and **high-value** - they codify existing good practices and make implicit patterns explicit.

**Estimated effort:** 8-12 hours for full implementation
**Risk level:** Low (mostly additive changes, backward compatible)
**Value:** High (prevents technical debt, improves maintainability)
