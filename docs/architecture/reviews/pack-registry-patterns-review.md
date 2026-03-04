# Pack/Registry Pattern Analysis for pixsim7

**Review Date**: 2026-01-16
**Scope**: Registry patterns managing packs, packages, plugins, and content bundles
**Focus Areas**:
- `backend/main/domain/**/package_registry.py`
- `backend/main/shared/ontology/vocabularies`
- `backend/main/infrastructure/plugins`
- `backend/main/services/semantic_packs`

---

## 1. Identified Registries Managing Packs/Packages

### 1.1 Core Registry Infrastructure

Located in `pixsim7/backend/main/lib/registry/`:

| Class | File | Purpose |
|-------|------|---------|
| `RegistryBase` | `base.py` | Abstract base with logging, reset hooks |
| `SimpleRegistry[K, V]` | `simple.py` | Single-level key-value storage |
| `NestedRegistry[NS, K, V]` | `nested.py` | Two-level namespace -> key -> value |
| `LayeredRegistry[K, V]` | `layered.py` | Ordered layers with precedence resolution |
| `LayeredNestedRegistry[NS, K, V]` | `layered.py` | Namespace + layered approach combined |
| `PackRegistryBase[NS, K, V, M]` | `pack.py` | Pack lifecycle for **layered** registries |
| `SimplePackRegistryBase[NS, K, V, M]` | `pack.py` | Pack lifecycle for **non-layered** registries (NEW) |
| `WorldMergeMixin[P, T]` | `world_merge.py` | Merges package configs with world.meta overrides |

### 1.2 Domain-Specific Pack Registries

| Registry | File Path | Manages | Base Class |
|----------|-----------|---------|------------|
| `CompositionPackageRegistry` | `domain/composition/package_registry.py` | Visual role definitions | `SimplePackRegistryBase` (MIGRATED) |
| `StatPackageRegistry` | `domain/game/stats/package_registry.py` | Stat definitions, derivation capabilities | `SimplePackRegistryBase` + `WorldMergeMixin` (MIGRATED) |
| `NpcSurfacePackageRegistry` | `domain/game/entities/npc_surfaces/package_registry.py` | NPC surface types (portrait, dialogue, closeup) | `SimplePackRegistryBase` (MIGRATED) |
| `VocabularyRegistry` | `shared/ontology/vocabularies/registry.py` | Vocab items (poses, moods, roles, locations) | `LayeredNestedRegistry` + `PackRegistryBase` |
| `SemanticPackDB` | `domain/semantic_pack.py` | Prompt bundles | SQLAlchemy (database model) |

### 1.3 Other Registries (Non-Pack Based)

| Registry | File Path | Notes |
|----------|-----------|-------|
| `ProviderRegistry` | `services/provider/registry/provider_registry.py` | AI model providers, manifest-based discovery |
| `BehaviorExtensionRegistry` | `infrastructure/plugins/behavior_registry.py` | Plugin-provided behavior extensions |
| `DerivationRegistry` | `domain/game/brain/derivation_registry.py` | Brain derivation plugins |
| `BlockRegistry` | `domain/narrative/action_blocks/registry.py` | Action blocks (no pack semantics) |
| `GameActionRegistry` | `domain/game/core/actions.py` | Game action metadata |

---

## 2. PackRegistryBase Overlap Analysis

### 2.1 PackRegistryBase Capabilities (Layered)

```python
class PackRegistryBase[NS, K, V, M]:
    def register_pack(pack_id, items, layer, meta, allow_overwrite) -> None
    def unregister_pack(pack_id) -> M  # Returns metadata, cleans up all items
    def list_packs() -> List[M]
    def has_pack(pack_id) -> bool
    def pack_items(pack_id) -> List[PackItemRef]
```

Key features:
- Requires a **layered** backing registry (e.g., `LayeredNestedRegistry`)
- Stores pack item indices with layer info for clean unload
- Supports metadata storage per pack
- `allow_overwrite=False` prevents re-registration
- `allow_overwrite=True` auto-unloads before re-registering

### 2.2 SimplePackRegistryBase Capabilities (Non-Layered)

```python
class SimplePackRegistryBase[NS, K, V, M]:
    def register_pack(pack_id, items, meta, allow_overwrite) -> None
    def unregister_pack(pack_id) -> M
    def list_packs() -> List[M]
    def has_pack(pack_id) -> bool
    def pack_items(pack_id) -> List[SimplePackItemRef]
    # Registry-like helpers:
    def get(pack_id) -> M
    def keys() -> List[str]
    def values() -> List[M]
    def clear() -> None
```

Key features:
- **No layer support** - designed for simple registries
- Item hooks: `_register_item()` / `_unregister_item()` (no-ops by default, override in subclass)
- Extends `RegistryBase` and `RegistryObserverMixin`
- Used by: `CompositionPackageRegistry`, `StatPackageRegistry`, `NpcSurfacePackageRegistry`

### 2.3 Current Adoption Matrix

| Feature | PackRegistryBase | SimplePackRegistryBase | Composition | Stats | NpcSurface | Vocabulary |
|---------|-----------------|------------------------|-------------|-------|------------|------------|
| `register_pack()` | Yes | Yes | Yes | Yes | Yes | Yes |
| `unregister_pack()` | Yes | Yes | Yes | Yes | Yes | Yes |
| `list_packs()` | Yes | Yes | Yes | Yes | Yes | Yes |
| `has_pack()` | Yes | Yes | Yes | Yes | Yes | Yes |
| `pack_items()` | Yes | Yes | Yes | Yes | Yes | Yes |
| Layer precedence | Yes | No | No | No | No | Yes |
| Clean unload support | Yes | Yes | Yes | Yes | Yes | Yes |

**Status**: All domain registries now use pack registry base classes:
- `VocabularyRegistry` uses `PackRegistryBase` (with `LayeredNestedRegistry`)
- `CompositionPackageRegistry`, `StatPackageRegistry`, `NpcSurfacePackageRegistry` use `SimplePackRegistryBase`

---

## 3. Override Semantics Comparison

| Registry | Override Method | Behavior | Unload Support |
|----------|-----------------|----------|----------------|
| `CompositionPackageRegistry` | `register_package()` | Replacement with warning log | No |
| `StatPackageRegistry` | `register_package()` | Replacement with warning log | No |
| `NpcSurfacePackageRegistry` | `register_package()` | Replacement with warning log | No |
| `VocabularyRegistry` | `LayeredNestedRegistry` | Layer precedence (later wins) | Yes |
| `PackRegistryBase` | `register_pack(allow_overwrite=True)` | Auto-unload then re-register | Yes |

### 3.1 WorldMergeMixin Specifics (StatPackageRegistry)

```python
# Merge strategies available:
class MergeStrategy(Enum):
    REPLACE = "replace"
    MERGE_BY_ID = "merge_by_id"
    DEEP_MERGE = "deep_merge"

# Usage: world.meta["stats_config"]["definitions"] overrides package defaults
```

---

## 4. Naming Inconsistencies

### 4.1 Term Usage Matrix

| Term | Usage Context | Examples |
|------|---------------|----------|
| **Pack** | PackRegistryBase, VocabPack | `register_pack()`, `unregister_pack()`, `VocabPackInfo` |
| **Package** | Domain models, domain registries | `CompositionPackage`, `StatPackage`, `register_package()` |
| **Plugin** | Extension system, catalog | `source_plugin_id`, `PluginCatalogEntry`, `plugin_id` |
| **Content Pack** | Not used | Term absent from codebase |

### 4.2 Specific Inconsistencies

| Location | Issue |
|----------|-------|
| `VocabularyRegistry._load_plugin_vocabs()` | Uses "pack" in `VocabPackInfo` (no `register_plugin_pack()` API) |
| `CompositionPackageRegistry.register_package()` | Uses "package" |
| `PackRegistryBase` | Methods use "pack" |
| Domain models | All use `*Package` suffix |
| `list_composition_packages()` vs `list_packs()` | Inconsistent method naming |

### 4.3 Field Naming

```python
# In domain packages:
source_plugin_id: str  # References plugin that provided the package

# In PackRegistryBase:
pack_id: str  # Identifier for the pack
```

---

## 5. Inheritance Hierarchy

```
RegistryBase
├── SimpleRegistry[K, V]
│   ├── ProviderRegistry[str, Provider]
│   ├── MetricRegistry[MetricType, MetricEvaluator]
│   └── GameActionRegistry[str, GameActionMeta]
│
├── SimplePackRegistryBase[NS, K, V, M]  (NEW)
│   ├── CompositionPackageRegistry (MIGRATED)
│   ├── StatPackageRegistry (+ WorldMergeMixin) (MIGRATED)
│   └── NpcSurfacePackageRegistry (MIGRATED)
│
├── NestedRegistry[NS, K, V]
│
├── LayeredRegistry[K, V]
│
└── LayeredNestedRegistry[NS, K, V]
    └── VocabularyRegistry (internal storage)

PackRegistryBase[NS, K, V, M]
└── VocabularyRegistry (pack lifecycle)

WorldMergeMixin[P, T]
└── StatPackageRegistry (world.meta merging)
```


---

## 6. Test Coverage

### 6.1 PackRegistryBase & SimplePackRegistryBase (COMPLETE)

Tests added in `backend/main/tests/test_pack_registry.py`:

**SimplePackRegistryBase tests (18 tests):**
- `test_register_pack_stores_items` - Items stored via `_register_item` hook
- `test_register_pack_tracks_item_refs` - Pack items tracked for unload
- `test_register_pack_stores_metadata` - Metadata stored and returned
- `test_unregister_pack_removes_items` - Items removed via `_unregister_item` hook
- `test_unregister_pack_returns_metadata` - Returns pack metadata
- `test_has_pack` - Pack existence check
- `test_allow_overwrite_false_raises_on_duplicate` - DuplicateKeyError raised
- `test_allow_overwrite_true_replaces_pack` - Auto-unload and re-register
- `test_allow_overwrite_per_call_override` - Per-call override of default
- `test_get_metadata` / `test_get_raises_on_missing` / `test_get_or_none`
- `test_keys_values_items` / `test_clear` / `test_len_and_contains`
- `test_observer_notifications` - Listener events for pack operations
- `test_register_pack_empty_items` - Empty pack tracking

**PackRegistryBase tests (11 tests):**
- `test_register_pack_stores_items_in_layer` - Items in correct layer
- `test_pack_items_returns_refs_with_layer` - Refs include layer info
- `test_unregister_pack_removes_items_from_layer` - Layer-specific removal
- `test_layer_precedence_higher_wins` - Higher layers override lower
- `test_cross_layer_override_restore` - Unload restores lower layer item
- `test_allow_overwrite_false_raises` / `test_allow_overwrite_true_replaces`
- `test_list_packs_returns_all_metadata` / `test_has_pack`
- `test_register_pack_no_metadata` / `test_unregister_nonexistent_returns_none`

**VocabularyRegistry runtime pack tests (7 tests):**
- `test_register_runtime_pack` - Runtime vocab item registration
- `test_unregister_runtime_pack` - Runtime item removal
- `test_runtime_pack_layer_precedence` - Override and restore behavior
- `test_packs_property_includes_runtime` - Pack listing
- `test_register_pack_allow_overwrite` - Pack replacement
- `test_register_pack_rebuilds_indices` / `test_unregister_pack_rebuilds_indices`

### 6.2 Remaining Test Gaps

| Registry | Missing Test Coverage |
|----------|----------------------|
| `StatPackageRegistry` | WorldMergeMixin edge cases, circular derivations |
| Domain registries | Integration tests with actual YAML packages |

---

## 7. Recommendations

### 7.1 Adopt Shared Base vs Remain Bespoke

| Registry | Recommendation | Rationale |
|----------|---------------|-----------|
| `VocabularyRegistry` | **Keep current** | Already uses PackRegistryBase; reference implementation |
| `StatPackageRegistry` | **Adopt PackRegistryBase** | Needs unload for plugin hot-reload; WorldMergeMixin can compose |
| `CompositionPackageRegistry` | **Adopt PackRegistryBase** | Would benefit from unload cleanup; roles from plugins |
| `NpcSurfacePackageRegistry` | **Adopt PackRegistryBase** | Same plugin lifecycle needs |
| `SemanticPackDB` | **Remain bespoke** | Database-backed, different lifecycle model |

### 7.2 Migration Path

1. **Standardize naming**: Choose "pack" or "package" consistently
   - Recommend: Use "pack" for runtime bundles, "package" for distribution units
   - Rename `register_package()` -> `register_pack()` in domain registries

2. **Refactor domain registries**:
   ```python
   # Before:
   class CompositionPackageRegistry(SimpleRegistry[str, CompositionPackage]):
       def register_package(self, pkg: CompositionPackage): ...

   # After:
   class CompositionPackageRegistry(PackRegistryBase[str, str, CompositionRoleDefinition, CompositionPackageMeta]):
       def register_pack(self, pack_id, items, layer="default", meta=None): ...
   ```

3. **Add layer support**: Use single-layer mode for backward compatibility where layering not needed

4. **Implement tests**: Priority order:
   - PackRegistryBase (critical, no coverage)
   - VocabularyRegistry pack operations
   - Domain registry override behavior

### 7.3 API Standardization

```python
# Proposed consistent interface across all pack registries:
class PackRegistry(Protocol[P, I, M]):
    def register_pack(self, pack_id: str, pack: P, layer: str = "default") -> None: ...
    def unregister_pack(self, pack_id: str) -> M: ...
    def list_packs(self) -> List[M]: ...
    def has_pack(self, pack_id: str) -> bool: ...
    def get_pack_items(self, pack_id: str) -> List[I]: ...
```

---

## 8. Action Items

### High Priority
- [x] Add comprehensive test suite for `PackRegistryBase` in `lib/registry/pack.py`
- [x] Add comprehensive test suite for `SimplePackRegistryBase`
- [x] Decide on adapter or layered backing for migrating SimpleRegistry-based registries
  - **Decision**: Created `SimplePackRegistryBase` as non-layered alternative
- [ ] Document override semantics for each registry

### Medium Priority
- [x] Migrate `StatPackageRegistry` to use `SimplePackRegistryBase`
- [x] Migrate `CompositionPackageRegistry` to use `SimplePackRegistryBase`
- [x] Migrate `NpcSurfacePackageRegistry` to use `SimplePackRegistryBase`
- [x] Add runtime pack API tests for `VocabularyRegistry` register/unregister

### Low Priority
- [ ] Standardize "pack" vs "package" naming across codebase
- [ ] Add type hints for pack metadata generics
- [ ] Create shared Protocol for pack registry interface
- [x] Evaluate cross-pack override/unload behavior (restore previous item)
  - **Result**: Tested in `test_cross_layer_override_restore` - works correctly

---

## 9. File Reference

| Category | Path |
|----------|------|
| Base registries | `backend/main/lib/registry/*.py` |
| Pack registry bases | `backend/main/lib/registry/pack.py` |
| Composition | `backend/main/domain/composition/package_registry.py` |
| Stats | `backend/main/domain/game/stats/package_registry.py` |
| NPC Surfaces | `backend/main/domain/game/entities/npc_surfaces/package_registry.py` |
| Vocabularies | `backend/main/shared/ontology/vocabularies/registry.py` |
| Semantic Packs | `backend/main/domain/semantic_pack.py` |
| Pack registry tests | `backend/main/tests/test_pack_registry.py` (NEW) |
| Registry utilities tests | `backend/main/tests/test_registry_utilities.py` |
| Composition tests | `backend/main/tests/test_composition_packages.py` |
