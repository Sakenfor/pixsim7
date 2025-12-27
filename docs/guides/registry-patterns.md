# Registry Patterns in PixSim7

**Last Updated:** 2025-11-20
**Status:** Documentation of current state + migration plan to unified pattern

---

## Problem Statement

PixSim7 currently has **10+ different registry implementations** with inconsistent APIs, features, and patterns. This creates:

- **Developer confusion** - Which registry should I use?
- **Maintenance burden** - Changes need to be replicated across multiple registries
- **Plugin ecosystem fragmentation** - No clear "one way" to register extensions
- **Feature duplication** - Some registries have locking/stats, others don't
- **Deprecation debt** - Old registries marked DEPRECATED but still in use

---

## Current Registry Landscape

### 1. 🎯 **BehaviorExtensionRegistry** (Target Pattern)

**Location:** `pixsim7/backend/main/infrastructure/plugins/behavior_registry.py:113`

**Type:** Class-based singleton (`behavior_registry`)

**Registration Methods:**
```python
behavior_registry.register_condition(cond_id, evaluator, metadata)
behavior_registry.register_effect(effect_id, handler, metadata)
behavior_registry.register_simulation_config(config_id, schema, metadata)
behavior_registry.register_component_schema(component_name, schema_cls, metadata)
```

**Features:**
- ✅ Thread-safe with locking mechanism
- ✅ Comprehensive metadata (tags, author, version)
- ✅ Statistics tracking (registration counts)
- ✅ Designed for plugin ecosystem
- ✅ Consistent API across all registration types

**Status:** ✅ **KEEP - Target pattern for all registries**

---

### 2. ⚠️ **EFFECT_HANDLERS** (Duplicate)

**Location:** `pixsim7/backend/main/domain/behavior/effects.py:25`

**Type:** Dict-based module-level registry

**Registration:**
```python
EFFECT_HANDLERS: Dict[str, EffectHandler] = {}

def register_effect_handler(effect_type: str, handler: EffectHandler):
    EFFECT_HANDLERS[effect_type] = handler
```

**Problem:** **DUPLICATES** `behavior_registry.register_effect()`

**Status:** 🔴 **DEPRECATED - Migrate to behavior_registry**

**Migration:** See Phase 1 below

---

### 3. ⚠️ **BUILTIN_CONDITIONS** (Transitional)

**Location:** `pixsim7/backend/main/domain/behavior/conditions.py:38`

**Type:** Dict-based module-level registry

**Registration:**
```python
BUILTIN_CONDITIONS: Dict[str, Callable] = {}
# Manual registration via _register_builtin_conditions() at module load
```

**Note:** Marked as DEPRECATED in favor of behavior_registry, but still used for built-in conditions

**Status:** ⚠️ **TRANSITIONAL - Keep for built-ins, document pattern**

**Reason:** Built-in conditions need to be available before plugin system loads. This is acceptable as an internal implementation detail, but plugins should use `behavior_registry.register_condition()`

---

### 4. 🤔 **SCORING_FACTORS** (Needs Migration)

**Location:** `pixsim7/backend/main/domain/behavior/scoring.py:36`

**Type:** Dict-based module-level registry

**Registration:**
```python
SCORING_FACTORS: Dict[str, ScoringFactorFunc] = {}

def register_scoring_factor(factor_id: str, evaluator: ScoringFactorFunc, default_weight: float = 1.0):
    SCORING_FACTORS[factor_id] = evaluator
    DEFAULT_SCORING_WEIGHTS[factor_id] = default_weight
```

**Problem:** Claims plugin support but not integrated with `behavior_registry`

**Status:** 🔴 **MIGRATE - Add to behavior_registry**

**Migration:** See Phase 2 below

---

### 5. 🔴 **COMPONENT_SCHEMAS** (Deprecated)

**Location:** `pixsim7/backend/main/domain/game/ecs.py:62`

**Type:** Dict-based module-level registry

**Registration:**
```python
COMPONENT_SCHEMAS = {
    "core": RelationshipCoreComponentSchema,
    "preferences": RelationshipPreferencesComponentSchema,
    # ...
}
```

**Problem:** Marked DEPRECATED; superseded by `behavior_registry.register_component_schema()`

**Status:** 🔴 **DEPRECATED - Remove fallback**

**Migration:** See Phase 3 below

---

### 6. 🔴 **CONDITION_EVALUATORS** (Deprecated)

**Location:** `pixsim7/backend/main/domain/behavior/conditions.py:29`

**Type:** Dict-based module-level registry

**Status:** 🔴 **DEPRECATED - Legacy only, document for removal**

---

### 7. ✅ **ProviderRegistry** (Keep - Different Domain)

**Location:** `pixsim7/backend/main/services/provider/registry.py:15`

**Type:** Class-based with auto-discovery

**Purpose:** LLM provider registration (different domain from behavior extensions)

**Status:** ✅ **KEEP - Separate concern**

**Note:** Provider registration is fundamentally different from behavior extensions. This registry handles infrastructure concerns (LLM providers, API keys, rate limits) rather than game behavior.

---

### 8. ✅ **DomainModelRegistry** (Keep - Different Domain)

**Location:** `pixsim7/backend/main/infrastructure/domain_registry.py:40`

**Type:** Class-based with dependency resolution

**Purpose:** Domain model registration with load order

**Status:** ✅ **KEEP - Separate concern**

---

### 9. ✅ **MetricRegistry** (Keep - Different Domain)

**Location:** `pixsim7/backend/main/domain/metrics/registry.py:9`

**Type:** Class-based

**Purpose:** Metric evaluator registration

**Status:** ✅ **KEEP - Separate concern**

**Note:** Could potentially be migrated to behavior_registry in the future, but not urgent.

---

### 10. ✅ **MAPPER_REGISTRY** (Keep - Different Domain)

**Location:** `pixsim7/backend/main/services/submission/parameter_mappers.py:55`

**Type:** Dict-based for parameter mappers

**Purpose:** Generation parameter mapping

**Status:** ✅ **KEEP - Separate concern**

---

## Target Architecture

### Registry Hierarchy

```
Registries (by domain)
│
├── BehaviorExtensionRegistry (behavior_registry)
│   ├── Conditions (condition evaluators)
│   ├── Effects (effect handlers)
│   ├── Scoring Factors (activity scoring)  ← TO ADD
│   ├── Simulation Configs (tier limits, etc.)
│   └── Component Schemas (ECS components)
│
├── ProviderRegistry (provider_registry)
│   └── LLM Providers (OpenAI, Anthropic, etc.)
│
├── DomainModelRegistry (domain_registry)
│   └── Domain Models (with dependency resolution)
│
├── MetricRegistry (metric_registry)
│   └── Relationship Metrics
│
└── MAPPER_REGISTRY
    └── Parameter Mappers (generation params)
```

### Design Principles

1. **One Domain, One Registry**
   - Behavior extensions → `behavior_registry`
   - Infrastructure (providers) → `ProviderRegistry`
   - Domain models → `DomainModelRegistry`
   - Don't consolidate unrelated concerns

2. **Plugin-First Design**
   - If plugins can register X, core should use same API
   - Follows "dogfooding" principle from Task 27

3. **Consistent API Pattern**
   ```python
   # Registration
   registry.register_X(id, implementation, metadata=None)

   # Retrieval
   registry.get_X(id) -> Optional[T]

   # Listing
   registry.list_Xs(filter=None) -> List[T]
   ```

4. **Built-in vs Plugin**
   - Built-ins can use internal registries (BUILTIN_CONDITIONS) for bootstrap
   - Plugins MUST use public registry API (behavior_registry)
   - Both should be accessible through unified query interface

---

## Migration Plan

### Phase 1: Migrate EFFECT_HANDLERS (Medium Effort - ½ day)

**Current State:**
```python
# effects.py
EFFECT_HANDLERS: Dict[str, EffectHandler] = {}

def register_effect_handler(effect_type: str, handler: EffectHandler):
    EFFECT_HANDLERS[effect_type] = handler

def apply_effects(effects, context):
    for effect in effects:
        effect_type = effect.get("type")
        handler = EFFECT_HANDLERS.get(effect_type)
        # ...
```

**Target State:**
```python
# effects.py
from pixsim7.backend.main.infrastructure.plugins.behavior_registry import behavior_registry

def register_effect_handler(effect_type: str, handler: EffectHandler):
    """
    Register effect handler with behavior registry.

    DEPRECATED: Use behavior_registry.register_effect() directly.
    This function is kept for backward compatibility.
    """
    import warnings
    warnings.warn(
        "register_effect_handler() is deprecated. "
        "Use behavior_registry.register_effect() instead.",
        DeprecationWarning,
        stacklevel=2
    )
    behavior_registry.register_effect(
        effect_id=effect_type,
        handler=handler,
        metadata={"legacy": True}
    )

def apply_effects(effects, context):
    for effect in effects:
        effect_type = effect.get("type")

        # Try behavior_registry first
        metadata = behavior_registry.get_effect(effect_type)
        if metadata:
            handler = metadata.handler
            # ...
            continue

        # Legacy fallback (remove in v2.0)
        logger.warning(f"Effect '{effect_type}' not found in behavior_registry")
```

**Migration Steps:**
1. Add deprecation warning to `register_effect_handler()`
2. Update `apply_effects()` to query behavior_registry first
3. Migrate built-in effect registrations to behavior_registry
4. Add integration test ensuring both paths work
5. Schedule removal of `EFFECT_HANDLERS` dict in v2.0

---

### Phase 2: Migrate SCORING_FACTORS (Medium Effort - ½ day)

**Current State:**
```python
# scoring.py
SCORING_FACTORS: Dict[str, ScoringFactorFunc] = {}

def register_scoring_factor(factor_id: str, evaluator: ScoringFactorFunc, default_weight: float = 1.0):
    SCORING_FACTORS[factor_id] = evaluator
    DEFAULT_SCORING_WEIGHTS[factor_id] = default_weight
```

**Target State:**

1. **Extend BehaviorExtensionRegistry** (behavior_registry.py):
```python
class BehaviorExtensionRegistry:
    def __init__(self):
        # ... existing code ...
        self._scoring_factors: Dict[str, ScoringFactorMetadata] = {}

    def register_scoring_factor(
        self,
        factor_id: str,
        evaluator: Callable,
        default_weight: float = 1.0,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Register a scoring factor for activity selection.

        Args:
            factor_id: Unique identifier (e.g., "baseWeight", "plugin:custom_factor")
            evaluator: Function(activity, npc_state, context) -> float
            default_weight: Default weight in scoring config
            metadata: Optional metadata (tags, author, version)
        """
        with self._lock:
            if factor_id in self._scoring_factors:
                logger.warning(f"Scoring factor '{factor_id}' already registered")
                return False

            self._scoring_factors[factor_id] = ScoringFactorMetadata(
                factor_id=factor_id,
                evaluator=evaluator,
                default_weight=default_weight,
                metadata=metadata or {},
                registered_at=datetime.utcnow()
            )

            logger.info(f"Registered scoring factor: {factor_id} (weight={default_weight})")
            return True

    def get_scoring_factor(self, factor_id: str) -> Optional[ScoringFactorMetadata]:
        """Get scoring factor metadata by ID."""
        return self._scoring_factors.get(factor_id)

    def list_scoring_factors(self) -> List[ScoringFactorMetadata]:
        """List all registered scoring factors."""
        return list(self._scoring_factors.values())
```

2. **Update scoring.py**:
```python
from pixsim7.backend.main.infrastructure.plugins.behavior_registry import behavior_registry

def register_scoring_factor(factor_id: str, evaluator: ScoringFactorFunc, default_weight: float = 1.0):
    """
    Register scoring factor with behavior registry.

    This function delegates to behavior_registry for unified registration.
    """
    return behavior_registry.register_scoring_factor(
        factor_id=factor_id,
        evaluator=evaluator,
        default_weight=default_weight
    )

def evaluate_activity_score(activity, npc_state, context, weights):
    """Score activity using registered factors."""
    score = 0.0

    for factor_id, weight in weights.items():
        # Get from behavior_registry
        metadata = behavior_registry.get_scoring_factor(factor_id)
        if metadata:
            evaluator = metadata.evaluator
            factor_score = evaluator(activity, npc_state, context)
            score += factor_score * weight
        else:
            logger.warning(f"Scoring factor '{factor_id}' not found")

    return score
```

3. **Migrate built-in factors** (in `_register_builtin_scoring_factors()`):
```python
def _register_builtin_scoring_factors():
    """Register built-in scoring factors at module load."""

    behavior_registry.register_scoring_factor(
        factor_id="baseWeight",
        evaluator=_eval_base_weight,
        default_weight=1.0,
        metadata={"builtin": True, "description": "Base activity weight"}
    )

    behavior_registry.register_scoring_factor(
        factor_id="activityPreference",
        evaluator=_eval_activity_preference,
        default_weight=2.0,
        metadata={"builtin": True, "description": "NPC activity preferences"}
    )

    # ... register all built-in factors
```

**Migration Steps:**
1. Add `register_scoring_factor()` method to BehaviorExtensionRegistry
2. Create `ScoringFactorMetadata` dataclass
3. Update `scoring.py` to use behavior_registry
4. Migrate built-in factor registrations
5. Update `evaluate_activity_score()` to query behavior_registry
6. Remove `SCORING_FACTORS` dict (can do immediately, no fallback needed)

---

### Phase 3: Remove COMPONENT_SCHEMAS Fallback (Small Effort - 2-3 hours)

**Current State:**
```python
# ecs.py:340-348
def get_component_schema(component_name: str) -> Optional[Type[ComponentSchema]]:
    # Try behavior_registry first
    metadata = behavior_registry.get_component_schema(component_name)
    if metadata:
        return metadata.schema_cls

    # Legacy fallback to COMPONENT_SCHEMAS dict
    return COMPONENT_SCHEMAS.get(component_name)
```

**Target State:**
```python
def get_component_schema(component_name: str) -> Optional[Type[ComponentSchema]]:
    """
    Get component schema by name.

    All components are registered via behavior_registry.register_component_schema()
    at startup. See register_core_components() for core components.
    """
    metadata = behavior_registry.get_component_schema(component_name)
    if metadata:
        return metadata.schema_cls

    logger.warning(f"Component schema '{component_name}' not found in behavior_registry")
    return None
```

**Migration Steps:**
1. Verify all core components are registered via `register_core_components()` (already done in Task 27)
2. Remove fallback to `COMPONENT_SCHEMAS` dict
3. Remove `COMPONENT_SCHEMAS` dict entirely
4. Add test to ensure all expected components are in behavior_registry
5. Update documentation to note COMPONENT_SCHEMAS removal

---

### Phase 4: Documentation and Cleanup (Small Effort - 1-2 hours)

1. **Update plugin documentation** (`docs/PLUGINS.md` or similar):
   - Show behavior_registry as single point of registration
   - Deprecate old registration functions
   - Provide migration examples

2. **Add to APP_MAP.md**:
   - Document registry hierarchy
   - Explain when to use which registry

3. **Create migration guide** (this document serves as starting point)

4. **Add integration tests**:
   - Test that plugin-registered items appear in behavior_registry
   - Test that built-in items are accessible
   - Test metadata is preserved

---

## Testing Strategy

### Unit Tests

```python
# test_registry_consolidation.py

def test_effect_handler_registration():
    """Test effect handlers work through behavior_registry."""

    def my_effect_handler(effect, context):
        return {"applied": True}

    # Register via behavior_registry
    behavior_registry.register_effect(
        effect_id="test:custom_effect",
        handler=my_effect_handler
    )

    # Verify retrieval
    metadata = behavior_registry.get_effect("test:custom_effect")
    assert metadata is not None
    assert metadata.handler == my_effect_handler

def test_scoring_factor_registration():
    """Test scoring factors work through behavior_registry."""

    def custom_scorer(activity, npc_state, context):
        return 5.0

    # Register via behavior_registry
    behavior_registry.register_scoring_factor(
        factor_id="test:custom_score",
        evaluator=custom_scorer,
        default_weight=1.5
    )

    # Verify retrieval
    metadata = behavior_registry.get_scoring_factor("test:custom_score")
    assert metadata is not None
    assert metadata.evaluator == custom_scorer
    assert metadata.default_weight == 1.5
```

### Integration Tests

```python
def test_plugin_can_register_all_extension_types():
    """Test plugin can register conditions, effects, scoring, components."""

    # Simulate plugin registration
    behavior_registry.register_condition("plugin:test_cond", lambda c: True)
    behavior_registry.register_effect("plugin:test_effect", lambda e, c: {})
    behavior_registry.register_scoring_factor("plugin:test_score", lambda a, n, c: 1.0)
    behavior_registry.register_component_schema("test_component", TestComponentSchema)

    # Verify all accessible
    assert behavior_registry.get_condition("plugin:test_cond") is not None
    assert behavior_registry.get_effect("plugin:test_effect") is not None
    assert behavior_registry.get_scoring_factor("plugin:test_score") is not None
    assert behavior_registry.get_component_schema("test_component") is not None
```

---

## Breaking Changes

### v2.0 (Future Release)

**Removed:**
- `EFFECT_HANDLERS` dict in `effects.py`
- `register_effect_handler()` function (use `behavior_registry.register_effect()`)
- `COMPONENT_SCHEMAS` dict in `ecs.py`
- `CONDITION_EVALUATORS` dict in `conditions.py`

**Migration Path:**
- Deprecation warnings added in current version
- All old APIs delegate to behavior_registry with warnings
- Plugins have one release cycle to migrate
- Built-ins already migrated

---

## FAQ

### Q: Why keep BUILTIN_CONDITIONS if we're consolidating?

**A:** Built-in conditions need to be available before the plugin system loads. It's an acceptable internal implementation detail. The key is:
- Plugins use `behavior_registry.register_condition()`
- Built-ins use internal `BUILTIN_CONDITIONS` dict
- Both are queryable through `evaluate_condition()` unified API

### Q: Should MetricRegistry be merged into behavior_registry?

**A:** Not urgent. Metrics are a different domain (relationship evaluation) vs behavior extensions (conditions, effects, scoring). Could be migrated in future for consistency, but not a priority.

### Q: What about frontend registries?

**A:** Frontend has its own needs (React components, UI plugins). Backend registry patterns don't directly apply. However, we should document frontend extension points separately.

### Q: How do plugins discover what they can register?

**A:** Behavior_registry should provide introspection:
```python
behavior_registry.get_registration_types()
# Returns: ["condition", "effect", "scoring_factor", "component_schema", "simulation_config"]
```

---

## Success Metrics

After migration is complete:

✅ **Single registration API** - Plugins use only `behavior_registry` for all behavior extensions
✅ **No duplicate registries** - EFFECT_HANDLERS, SCORING_FACTORS, COMPONENT_SCHEMAS removed
✅ **Clear documentation** - Developers know which registry to use for what
✅ **Backward compatibility** - Old code still works with deprecation warnings
✅ **Test coverage** - Integration tests verify unified registration works

---

## Timeline

| Phase | Effort | Target |
|-------|--------|--------|
| Phase 0: Documentation (this doc) | ✅ Complete | 2025-11-20 |
| Phase 1: Migrate EFFECT_HANDLERS | Medium (½ day) | Next |
| Phase 2: Migrate SCORING_FACTORS | Medium (½ day) | Next |
| Phase 3: Remove COMPONENT_SCHEMAS fallback | Small (2-3 hrs) | Next |
| Phase 4: Documentation & cleanup | Small (1-2 hrs) | Next |
| **Total Estimated Time** | **1.5-2 days** | |

---

## References

- **behavior_registry.py** - Target pattern implementation
- **Task 27** - Registry unification and dogfooding principle
- **Task 28** - Extensible scoring system (uses SCORING_FACTORS)
- **effects.py** - EFFECT_HANDLERS to migrate
- **ecs.py** - COMPONENT_SCHEMAS fallback to remove

---

## Frontend Registry Patterns

**Last Updated:** 2025-12-27

The frontend has its own registry system with `BaseRegistry<T>` as the standard base class.

### Before Creating a New Frontend Registry

#### Required Checklist

- [ ] **Extends BaseRegistry** — If not, document justification in file header
- [ ] **Has standard interface:**
  - `register(item: T): boolean` — Returns false if already exists
  - `forceRegister(item: T): void` — Overwrites existing
  - `unregister(id: string): boolean` — Returns true if removed
  - `get(id: string): T | undefined`
  - `getAll(): T[]`
  - `has(id: string): boolean`
  - `clear(): void` — For testing
- [ ] **Has listener support** via BaseRegistry `subscribe()` method
- [ ] **Exported as singleton** instance (e.g., `export const myRegistry = new MyRegistry()`)
- [ ] **Type constraint** — Item type extends `Identifiable` (has `id: string`)

#### Standard Implementation

```typescript
// features/myFeature/lib/registry.ts
import { BaseRegistry, Identifiable } from '@lib/core/BaseRegistry';

export interface MyItem extends Identifiable {
  id: string;
  name: string;
  // ... other fields
}

class MyRegistry extends BaseRegistry<MyItem> {
  // Add domain-specific methods if needed
  getByCategory(category: string): MyItem[] {
    return this.getAll().filter(item => item.category === category);
  }
}

export const myRegistry = new MyRegistry();
```

### Justified Exceptions

Some registries don't extend BaseRegistry for valid architectural reasons:

| Registry | Justification |
|----------|---------------|
| NodeTypeRegistry | Requires LRU cache (50 entries), lazy loading, category/scope indexes |
| CapabilityRegistry | Factory pattern for multi-provider capability resolution |

If your use case requires deviation:
1. Document the reason in the file header
2. Get architecture review approval
3. Add to the exception table in `BaseRegistry.ts` JSDoc

### Current Frontend Registry Status

| Registry | Extends BaseRegistry? | Migration Status |
|----------|----------------------|------------------|
| PanelRegistry | Yes | Complete |
| SettingsRegistry | Yes | Complete |
| GatingRegistry | Yes | Complete |
| GalleryToolRegistry | Yes | Complete |
| BrainToolRegistry | Yes | Complete |
| WorldToolRegistry | Yes | Complete |
| NodeTypeRegistry | No | Justified exception |
| CapabilityRegistry | No | Justified exception |

### Migration Complete

All registries that should extend BaseRegistry have been migrated. The remaining two
(NodeTypeRegistry and CapabilityRegistry) have documented justifications for their
custom implementations.
