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
| `PackRegistryBase[NS, K, V, M]` | `pack.py` | **Key abstraction for pack lifecycle** |
| `WorldMergeMixin[P, T]` | `world_merge.py` | Merges package configs with world.meta overrides |

### 1.2 Domain-Specific Pack Registries

| Registry | File Path | Manages | Base Class |
|----------|-----------|---------|------------|
| `CompositionPackageRegistry` | `domain/composition/package_registry.py` | Visual role definitions | `SimpleRegistry` |
| `StatPackageRegistry` | `domain/game/stats/package_registry.py` | Stat definitions, derivation capabilities | `SimpleRegistry` + `WorldMergeMixin` |
| `NpcSurfacePackageRegistry` | `domain/game/entities/npc_surfaces/package_registry.py` | NPC surface types (portrait, dialogue, closeup) | `SimpleRegistry` |
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

### 2.1 PackRegistryBase Capabilities

```python
class PackRegistryBase[NS, K, V, M]:
    def register_pack(pack_id, items, layer, meta, allow_overwrite) -> None
    def unregister_pack(pack_id) -> M  # Returns metadata, cleans up all items
    def list_packs() -> List[M]
    def has_pack(pack_id) -> bool
    def pack_items(pack_id) -> List[PackItemRef]
```

Key features:
- Stores pack item indices for clean unload
- Supports metadata storage per pack
- `allow_overwrite=False` prevents re-registration
- `allow_overwrite=True` auto-unloads before re-registering

Note: `PackRegistryBase` assumes the backing registry supports layered
registration (i.e., `register(..., layer=...)`). SimpleRegistry-based registries
need an adapter or a different base to adopt it cleanly.

### 2.2 Current Adoption Matrix

| Feature | PackRegistryBase | Composition | Stats | NpcSurface | Vocabulary |
|---------|-----------------|-------------|-------|------------|------------|
| `register_pack()` | Yes | No | No | No | Yes |
| `unregister_pack()` | Yes | No | No | No | Yes |
| `list_packs()` with metadata | Yes | No | No | No | Yes |
| Layer precedence | Depends on backing registry | No | No | No | Yes |
| Pack item tracking | Yes | No | No | No | Yes |
| Clean unload support | Yes | No | No | No | Yes |

**Finding**: Only `VocabularyRegistry` uses `PackRegistryBase`. The three domain registries lack:
- Explicit unload support
- Layer-based override resolution
- Centralized pack item tracking for cleanup

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
-> SimpleRegistry[K, V]
   -> CompositionPackageRegistry[str, CompositionPackage]
   -> StatPackageRegistry[str, StatPackage] (+ WorldMergeMixin)
   -> NpcSurfacePackageRegistry[str, NpcSurfacePackage]
   -> ProviderRegistry[str, Provider]
   -> MetricRegistry[MetricType, MetricEvaluator]
   -> GameActionRegistry[str, GameActionMeta]

-> NestedRegistry[NS, K, V]

-> LayeredRegistry[K, V]

-> LayeredNestedRegistry[NS, K, V]
   -> VocabularyRegistry (internal storage)

PackRegistryBase[NS, K, V, M]
-> VocabularyRegistry (pack lifecycle)

WorldMergeMixin[P, T]
-> StatPackageRegistry (world.meta merging)
```


---

## 6. Missing Tests & Edge Cases

### 6.1 PackRegistryBase (CRITICAL - No Tests Found)

```python
# Required test cases:
def test_register_pack_stores_items_correctly(): ...
def test_unregister_pack_removes_all_items(): ...
def test_unregister_pack_returns_metadata(): ...
def test_register_pack_allow_overwrite_false_raises_on_duplicate(): ...
def test_register_pack_allow_overwrite_true_unloads_first(): ...
def test_list_packs_returns_correct_metadata(): ...
def test_has_pack_returns_correct_boolean(): ...
def test_pack_items_returns_all_registered_items(): ...
def test_cross_pack_item_override_respects_layer_order(): ...
```

### 6.2 Domain Registry Gaps

| Registry | Missing Test Coverage |
|----------|----------------------|
| `CompositionPackageRegistry` | Override behavior, duplicate role IDs, unload cleanup |
| `StatPackageRegistry` | WorldMergeMixin edge cases, circular derivations, partial merge failures |
| `NpcSurfacePackageRegistry` | Package replacement, surface type conflicts |
| `VocabularyRegistry` | Layer precedence resolution, plugin pack unload, cross-pack overrides |

### 6.3 Edge Cases to Test

1. **Unload cleanup**: Verify all items removed when pack unregistered
2. **Cross-pack overrides**: Item in pack A overridden by pack B, then B unloaded - does A's item restore?
3. **Metadata lists**: `list_packs()` accuracy after register/unregister cycles
4. **Layer precedence**: Core vs plugin pack resolution order
5. **Error handling**: Malformed package data, missing required fields
6. **Circular dependencies**: Derivation capabilities referencing each other

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
- [ ] Add comprehensive test suite for `PackRegistryBase` in `lib/registry/pack.py`
- [ ] Document override semantics for each registry
- [ ] Decide on adapter or layered backing for migrating SimpleRegistry-based registries

### Medium Priority
- [ ] Migrate `StatPackageRegistry` to use `PackRegistryBase`
- [ ] Migrate `CompositionPackageRegistry` to use `PackRegistryBase`
- [ ] Migrate `NpcSurfacePackageRegistry` to use `PackRegistryBase`
- [ ] Add runtime pack API tests for `VocabularyRegistry` register/unregister

### Low Priority
- [ ] Standardize "pack" vs "package" naming across codebase
- [ ] Add type hints for pack metadata generics
- [ ] Create shared Protocol for pack registry interface
- [ ] Evaluate cross-pack override/unload behavior (restore previous item)

---

## 9. File Reference

| Category | Path |
|----------|------|
| Base registries | `backend/main/lib/registry/*.py` |
| Composition | `backend/main/domain/composition/package_registry.py` |
| Stats | `backend/main/domain/game/stats/package_registry.py` |
| NPC Surfaces | `backend/main/domain/game/entities/npc_surfaces/package_registry.py` |
| Vocabularies | `backend/main/shared/ontology/vocabularies/registry.py` |
| Semantic Packs | `backend/main/domain/semantic_pack.py` |
| Existing tests | `backend/main/tests/test_registry_utilities.py` |
| Existing tests | `backend/main/tests/test_composition_packages.py` |
