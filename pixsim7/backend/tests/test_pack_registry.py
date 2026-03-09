"""
Tests for pack registry classes (SimplePackRegistryBase, PackRegistryBase).
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pytest

from pixsim7.backend.main.lib.registry import (
    SimplePackRegistryBase,
    SimplePackItemRef,
    PackRegistryBase,
    PackItemRef,
    LayeredNestedRegistry,
    DuplicateKeyError,
    KeyNotFoundError,
)


# =============================================================================
# Test Fixtures: Concrete implementations for testing
# =============================================================================


@dataclass(frozen=True)
class PackMeta:
    """Test metadata for packs."""
    id: str
    label: str
    version: str = "1.0.0"


class ConcreteSimplePackRegistry(SimplePackRegistryBase[str, str, Any, PackMeta]):
    """
    Concrete SimplePackRegistryBase for testing.

    Stores items in an internal dict to verify register/unregister behavior.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._items: Dict[str, Dict[str, Any]] = {}

    def _register_item(self, namespace: str, key: str, item: Any) -> None:
        if namespace not in self._items:
            self._items[namespace] = {}
        self._items[namespace][key] = item

    def _unregister_item(self, namespace: str, key: str) -> None:
        if namespace in self._items:
            self._items[namespace].pop(key, None)

    def get_item(self, namespace: str, key: str) -> Optional[Any]:
        """Helper to retrieve items for test assertions."""
        return self._items.get(namespace, {}).get(key)

    def all_items(self) -> Dict[str, Dict[str, Any]]:
        """Helper to get all items for test assertions."""
        return self._items


# =============================================================================
# Tests: SimplePackRegistryBase
# =============================================================================


class TestSimplePackRegistryBase:
    """Tests for SimplePackRegistryBase."""

    def test_register_pack_stores_items(self):
        """register_pack should store items via _register_item hook."""
        registry = ConcreteSimplePackRegistry(name="test")

        items = [
            ("poses", "pose:standing", {"label": "Standing"}),
            ("poses", "pose:sitting", {"label": "Sitting"}),
            ("moods", "mood:happy", {"label": "Happy"}),
        ]
        meta = PackMeta(id="test-pack", label="Test Pack")

        registry.register_pack("test-pack", items, meta=meta)

        # Verify items were stored
        assert registry.get_item("poses", "pose:standing") == {"label": "Standing"}
        assert registry.get_item("poses", "pose:sitting") == {"label": "Sitting"}
        assert registry.get_item("moods", "mood:happy") == {"label": "Happy"}

    def test_register_pack_tracks_item_refs(self):
        """register_pack should track item refs for later unload."""
        registry = ConcreteSimplePackRegistry(name="test")

        items = [
            ("poses", "pose:standing", {"label": "Standing"}),
            ("moods", "mood:happy", {"label": "Happy"}),
        ]
        meta = PackMeta(id="test-pack", label="Test Pack")

        registry.register_pack("test-pack", items, meta=meta)

        # Verify pack_items returns correct refs
        refs = list(registry.pack_items("test-pack"))
        assert len(refs) == 2
        assert SimplePackItemRef(namespace="poses", key="pose:standing") in refs
        assert SimplePackItemRef(namespace="moods", key="mood:happy") in refs

    def test_register_pack_stores_metadata(self):
        """register_pack should store and return metadata via list_packs."""
        registry = ConcreteSimplePackRegistry(name="test")

        meta1 = PackMeta(id="pack1", label="Pack 1", version="1.0")
        meta2 = PackMeta(id="pack2", label="Pack 2", version="2.0")

        registry.register_pack("pack1", [], meta=meta1)
        registry.register_pack("pack2", [], meta=meta2)

        packs = registry.list_packs()
        assert len(packs) == 2
        assert meta1 in packs
        assert meta2 in packs

    def test_unregister_pack_removes_items(self):
        """unregister_pack should remove all pack items."""
        registry = ConcreteSimplePackRegistry(name="test")

        items = [
            ("poses", "pose:standing", {"label": "Standing"}),
            ("moods", "mood:happy", {"label": "Happy"}),
        ]
        meta = PackMeta(id="test-pack", label="Test Pack")

        registry.register_pack("test-pack", items, meta=meta)
        assert registry.get_item("poses", "pose:standing") is not None

        # Unregister
        returned_meta = registry.unregister_pack("test-pack")

        # Items should be gone
        assert registry.get_item("poses", "pose:standing") is None
        assert registry.get_item("moods", "mood:happy") is None

        # Metadata should be returned
        assert returned_meta == meta

    def test_unregister_pack_returns_metadata(self):
        """unregister_pack should return the pack metadata."""
        registry = ConcreteSimplePackRegistry(name="test")

        meta = PackMeta(id="test-pack", label="Test Pack", version="1.2.3")
        registry.register_pack("test-pack", [], meta=meta)

        returned = registry.unregister_pack("test-pack")

        assert returned == meta
        assert returned.version == "1.2.3"

    def test_unregister_pack_nonexistent_returns_none(self):
        """unregister_pack on nonexistent pack should return None."""
        registry = ConcreteSimplePackRegistry(name="test")

        result = registry.unregister_pack("nonexistent")

        assert result is None

    def test_has_pack(self):
        """has_pack should check pack existence."""
        registry = ConcreteSimplePackRegistry(name="test")

        assert not registry.has_pack("test-pack")

        registry.register_pack("test-pack", [], meta=PackMeta(id="test-pack", label="Test"))

        assert registry.has_pack("test-pack")

        registry.unregister_pack("test-pack")

        assert not registry.has_pack("test-pack")

    def test_allow_overwrite_false_raises_on_duplicate(self):
        """With allow_overwrite=False, duplicate pack_id should raise."""
        registry = ConcreteSimplePackRegistry(name="test", allow_overwrite=False)

        meta = PackMeta(id="test-pack", label="Test Pack")
        registry.register_pack("test-pack", [], meta=meta)

        with pytest.raises(DuplicateKeyError) as exc_info:
            registry.register_pack("test-pack", [], meta=meta)

        assert exc_info.value.key == "test-pack"

    def test_allow_overwrite_true_replaces_pack(self):
        """With allow_overwrite=True, should unload old pack and register new."""
        registry = ConcreteSimplePackRegistry(name="test", allow_overwrite=True)

        items1 = [("poses", "pose:old", {"label": "Old"})]
        meta1 = PackMeta(id="test-pack", label="Original", version="1.0")
        registry.register_pack("test-pack", items1, meta=meta1)

        assert registry.get_item("poses", "pose:old") is not None

        # Re-register with new items
        items2 = [("poses", "pose:new", {"label": "New"})]
        meta2 = PackMeta(id="test-pack", label="Updated", version="2.0")
        registry.register_pack("test-pack", items2, meta=meta2)

        # Old items should be gone, new items present
        assert registry.get_item("poses", "pose:old") is None
        assert registry.get_item("poses", "pose:new") == {"label": "New"}

        # Metadata should be updated
        packs = registry.list_packs()
        assert len(packs) == 1
        assert packs[0].version == "2.0"

    def test_allow_overwrite_per_call_override(self):
        """allow_overwrite parameter on register_pack overrides default."""
        registry = ConcreteSimplePackRegistry(name="test", allow_overwrite=False)

        meta = PackMeta(id="test-pack", label="Test")
        registry.register_pack("test-pack", [], meta=meta)

        # Should work with explicit allow_overwrite=True
        meta2 = PackMeta(id="test-pack", label="Updated")
        registry.register_pack("test-pack", [], meta=meta2, allow_overwrite=True)

        assert registry.list_packs()[0].label == "Updated"

    def test_get_metadata(self):
        """get() should return pack metadata."""
        registry = ConcreteSimplePackRegistry(name="test")

        meta = PackMeta(id="test-pack", label="Test Pack")
        registry.register_pack("test-pack", [], meta=meta)

        result = registry.get("test-pack")
        assert result == meta

    def test_get_raises_on_missing(self):
        """get() should raise KeyNotFoundError for missing pack."""
        registry = ConcreteSimplePackRegistry(name="test")

        with pytest.raises(KeyNotFoundError) as exc_info:
            registry.get("nonexistent")

        assert "nonexistent" in str(exc_info.value)

    def test_get_or_none(self):
        """get_or_none() should return None for missing pack."""
        registry = ConcreteSimplePackRegistry(name="test")

        assert registry.get_or_none("nonexistent") is None

        meta = PackMeta(id="test-pack", label="Test")
        registry.register_pack("test-pack", [], meta=meta)

        assert registry.get_or_none("test-pack") == meta

    def test_keys_values_items(self):
        """keys(), values(), items() should return pack data."""
        registry = ConcreteSimplePackRegistry(name="test")

        meta1 = PackMeta(id="pack1", label="Pack 1")
        meta2 = PackMeta(id="pack2", label="Pack 2")

        registry.register_pack("pack1", [], meta=meta1)
        registry.register_pack("pack2", [], meta=meta2)

        assert set(registry.keys()) == {"pack1", "pack2"}
        assert set(registry.values()) == {meta1, meta2}
        assert set(registry.items()) == {("pack1", meta1), ("pack2", meta2)}

    def test_clear(self):
        """clear() should remove all packs and items."""
        registry = ConcreteSimplePackRegistry(name="test")

        items = [("poses", "pose:test", {"label": "Test"})]
        meta = PackMeta(id="test-pack", label="Test")
        registry.register_pack("test-pack", items, meta=meta)

        assert len(registry) == 1
        assert registry.get_item("poses", "pose:test") is not None

        registry.clear()

        assert len(registry) == 0
        assert not registry.has_pack("test-pack")
        # Note: clear() doesn't call _unregister_item for performance
        # Items may still exist in _items dict

    def test_len_and_contains(self):
        """Should support len() and 'in' operator."""
        registry = ConcreteSimplePackRegistry(name="test")

        assert len(registry) == 0
        assert "test-pack" not in registry

        meta = PackMeta(id="test-pack", label="Test")
        registry.register_pack("test-pack", [], meta=meta)

        assert len(registry) == 1
        assert "test-pack" in registry

    def test_observer_notifications(self):
        """Should notify listeners on pack operations."""
        registry = ConcreteSimplePackRegistry(name="test")
        events: List[tuple] = []

        def listener(event: str, payload: Dict[str, Any]):
            events.append((event, payload))

        registry.add_listener(listener)

        meta = PackMeta(id="test-pack", label="Test")
        registry.register_pack("test-pack", [], meta=meta)
        registry.unregister_pack("test-pack")

        assert len(events) == 2
        assert events[0][0] == "register_pack"
        assert events[0][1]["pack_id"] == "test-pack"
        assert events[1][0] == "unregister_pack"
        assert events[1][1]["pack_id"] == "test-pack"

    def test_register_pack_empty_items(self):
        """register_pack with no items should still track the pack."""
        registry = ConcreteSimplePackRegistry(name="test")

        meta = PackMeta(id="empty-pack", label="Empty")
        registry.register_pack("empty-pack", meta=meta)

        assert registry.has_pack("empty-pack")
        assert list(registry.pack_items("empty-pack")) == []
        assert registry.get("empty-pack") == meta


# =============================================================================
# Tests: PackRegistryBase (with LayeredNestedRegistry)
# =============================================================================


class TestPackRegistryBase:
    """Tests for PackRegistryBase with layered registry backing."""

    def _make_registry(self) -> tuple[LayeredNestedRegistry, PackRegistryBase]:
        """Create a layered registry and pack registry for testing."""
        backing = LayeredNestedRegistry[str, str, Any](
            name="test_layered",
            layer_order=["core"],
            default_layer="core",
            allow_overwrite=False,
        )
        backing.add_namespace("poses")
        backing.add_namespace("moods")

        pack_registry = PackRegistryBase[str, str, Any, PackMeta](
            registry=backing,
            name="test_packs",
        )
        return backing, pack_registry

    def test_register_pack_stores_items_in_layer(self):
        """register_pack should register items in the specified layer."""
        backing, pack_reg = self._make_registry()

        backing.add_layer("plugin")

        items = [
            ("poses", "pose:standing", {"label": "Standing"}),
            ("moods", "mood:happy", {"label": "Happy"}),
        ]
        meta = PackMeta(id="test-pack", label="Test Pack")

        pack_reg.register_pack("test-pack", items, layer="plugin", meta=meta)

        # Items should be accessible via backing registry
        assert backing.get("poses", "pose:standing") == {"label": "Standing"}
        assert backing.get("moods", "mood:happy") == {"label": "Happy"}

    def test_pack_items_returns_refs_with_layer(self):
        """pack_items should return refs including layer info."""
        backing, pack_reg = self._make_registry()

        backing.add_layer("plugin")

        items = [
            ("poses", "pose:standing", {"label": "Standing"}),
        ]
        meta = PackMeta(id="test-pack", label="Test Pack")

        pack_reg.register_pack("test-pack", items, layer="plugin", meta=meta)

        refs = list(pack_reg.pack_items("test-pack"))
        assert len(refs) == 1
        assert refs[0] == PackItemRef(namespace="poses", key="pose:standing", layer="plugin")

    def test_unregister_pack_removes_items_from_layer(self):
        """unregister_pack should remove items from their specific layer."""
        backing, pack_reg = self._make_registry()

        backing.add_layer("plugin")

        items = [
            ("poses", "pose:standing", {"label": "Standing"}),
        ]
        meta = PackMeta(id="test-pack", label="Test Pack")

        pack_reg.register_pack("test-pack", items, layer="plugin", meta=meta)
        assert backing.get("poses", "pose:standing") is not None

        returned = pack_reg.unregister_pack("test-pack")

        assert returned == meta
        assert backing.get("poses", "pose:standing") is None

    def test_layer_precedence_higher_wins(self):
        """Higher precedence layers should override lower ones."""
        backing, pack_reg = self._make_registry()

        backing.add_layer("plugin")
        backing.add_layer("runtime")

        # Register in core layer
        core_items = [("poses", "pose:standing", {"label": "Core Standing"})]
        core_meta = PackMeta(id="core-pack", label="Core")
        pack_reg.register_pack("core-pack", core_items, layer="core", meta=core_meta)

        assert backing.get("poses", "pose:standing") == {"label": "Core Standing"}

        # Register override in plugin layer
        plugin_items = [("poses", "pose:standing", {"label": "Plugin Standing"})]
        plugin_meta = PackMeta(id="plugin-pack", label="Plugin")
        pack_reg.register_pack("plugin-pack", plugin_items, layer="plugin", meta=plugin_meta)

        # Plugin should win
        assert backing.get("poses", "pose:standing") == {"label": "Plugin Standing"}

        # Unregister plugin pack - core should be visible again
        pack_reg.unregister_pack("plugin-pack")
        assert backing.get("poses", "pose:standing") == {"label": "Core Standing"}

    def test_cross_layer_override_restore(self):
        """After unloading higher layer pack, lower layer items should restore."""
        backing, pack_reg = self._make_registry()

        backing.add_layer("plugin")

        # Core item
        core_items = [("poses", "pose:test", {"source": "core"})]
        pack_reg.register_pack("core-pack", core_items, layer="core", meta=PackMeta(id="core", label="Core"))

        # Plugin override
        plugin_items = [("poses", "pose:test", {"source": "plugin"})]
        pack_reg.register_pack("plugin-pack", plugin_items, layer="plugin", meta=PackMeta(id="plugin", label="Plugin"))

        assert backing.get("poses", "pose:test")["source"] == "plugin"

        # Unload plugin
        pack_reg.unregister_pack("plugin-pack")

        # Core should be restored
        assert backing.get("poses", "pose:test")["source"] == "core"

    def test_allow_overwrite_false_raises(self):
        """With allow_overwrite=False, re-registering same pack_id should raise."""
        backing, pack_reg = self._make_registry()

        meta = PackMeta(id="test-pack", label="Test")
        pack_reg.register_pack("test-pack", [], layer="core", meta=meta)

        with pytest.raises(DuplicateKeyError) as exc_info:
            pack_reg.register_pack("test-pack", [], layer="core", meta=meta, allow_overwrite=False)

        assert exc_info.value.key == "test-pack"

    def test_allow_overwrite_true_replaces(self):
        """With allow_overwrite=True, should unload old pack first."""
        backing, pack_reg = self._make_registry()

        items1 = [("poses", "pose:old", {"label": "Old"})]
        meta1 = PackMeta(id="test-pack", label="Original", version="1.0")
        pack_reg.register_pack("test-pack", items1, layer="core", meta=meta1)

        items2 = [("poses", "pose:new", {"label": "New"})]
        meta2 = PackMeta(id="test-pack", label="Updated", version="2.0")
        pack_reg.register_pack("test-pack", items2, layer="core", meta=meta2, allow_overwrite=True)

        # Old item gone, new item present
        assert backing.get("poses", "pose:old") is None
        assert backing.get("poses", "pose:new") == {"label": "New"}

        # Metadata updated
        packs = pack_reg.list_packs()
        assert len(packs) == 1
        assert packs[0].version == "2.0"

    def test_list_packs_returns_all_metadata(self):
        """list_packs should return metadata for all registered packs."""
        backing, pack_reg = self._make_registry()

        meta1 = PackMeta(id="pack1", label="Pack 1")
        meta2 = PackMeta(id="pack2", label="Pack 2")

        pack_reg.register_pack("pack1", [], layer="core", meta=meta1)
        pack_reg.register_pack("pack2", [], layer="core", meta=meta2)

        packs = pack_reg.list_packs()
        assert len(packs) == 2
        assert meta1 in packs
        assert meta2 in packs

    def test_has_pack(self):
        """has_pack should check pack existence."""
        backing, pack_reg = self._make_registry()

        assert not pack_reg.has_pack("test-pack")

        pack_reg.register_pack("test-pack", [], layer="core", meta=PackMeta(id="test", label="Test"))

        assert pack_reg.has_pack("test-pack")

        pack_reg.unregister_pack("test-pack")

        assert not pack_reg.has_pack("test-pack")

    def test_register_pack_no_metadata(self):
        """register_pack without meta should still work."""
        backing, pack_reg = self._make_registry()

        items = [("poses", "pose:test", {"label": "Test"})]
        pack_reg.register_pack("test-pack", items, layer="core")

        assert pack_reg.has_pack("test-pack")
        assert backing.get("poses", "pose:test") is not None
        # list_packs won't include it since no meta
        assert pack_reg.list_packs() == []

    def test_unregister_nonexistent_returns_none(self):
        """unregister_pack on nonexistent pack should return None."""
        backing, pack_reg = self._make_registry()

        result = pack_reg.unregister_pack("nonexistent")

        assert result is None


# =============================================================================
# Tests: VocabularyRegistry Runtime Pack API
# =============================================================================


class TestVocabularyRegistryRuntimePacks:
    """Tests for VocabularyRegistry register_pack/unregister_pack."""

    @pytest.fixture
    def vocab_registry(self, tmp_path):
        """Create a VocabularyRegistry with temp directories."""
        from pixsim7.backend.main.shared.ontology.vocabularies.registry import VocabularyRegistry

        vocab_dir = tmp_path / "vocabs"
        vocab_dir.mkdir()

        # Create minimal core vocab files
        (vocab_dir / "poses.yaml").write_text("poses: {}")
        (vocab_dir / "moods.yaml").write_text("moods: {}")
        (vocab_dir / "roles.yaml").write_text("roles: {}")
        (vocab_dir / "locations.yaml").write_text("locations: {}")
        (vocab_dir / "ratings.yaml").write_text("ratings: {}")
        (vocab_dir / "parts.yaml").write_text("parts: {}")
        (vocab_dir / "influence_regions.yaml").write_text("influence_regions: {}")
        (vocab_dir / "spatial.yaml").write_text("spatial: {}")
        (vocab_dir / "progression.yaml").write_text("progression: {}")
        (vocab_dir / "slots.yaml").write_text("slots: {}")

        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()

        registry = VocabularyRegistry(
            vocab_dir=vocab_dir,
            plugins_dir=plugins_dir,
            strict_mode=False,
        )
        return registry

    def test_register_runtime_pack(self, vocab_registry):
        """register_pack should add vocab items at runtime."""
        pack_data = {
            "poses": {
                "pose:runtime_standing": {
                    "label": "Runtime Standing",
                    "category": "standing",
                },
            },
            "moods": {
                "mood:runtime_happy": {
                    "label": "Runtime Happy",
                },
            },
        }

        pack_info = vocab_registry.register_pack(
            pack_id="runtime-test",
            data=pack_data,
            label="Runtime Test Pack",
        )

        assert pack_info.id == "runtime-test"
        assert pack_info.concepts_added.get("poses") == 1
        assert pack_info.concepts_added.get("moods") == 1

        # Items should be accessible
        pose = vocab_registry.get("poses", "pose:runtime_standing")
        assert pose is not None
        assert pose.label == "Runtime Standing"

        mood = vocab_registry.get("moods", "mood:runtime_happy")
        assert mood is not None

    def test_unregister_runtime_pack(self, vocab_registry):
        """unregister_pack should remove runtime items."""
        pack_data = {
            "poses": {
                "pose:temp": {"label": "Temporary"},
            },
        }

        vocab_registry.register_pack("temp-pack", pack_data, label="Temp")

        assert vocab_registry.get("poses", "pose:temp") is not None

        removed = vocab_registry.unregister_pack("temp-pack")

        assert removed is not None
        assert removed.id == "temp-pack"
        assert vocab_registry.get("poses", "pose:temp") is None

    def test_runtime_pack_layer_precedence(self, vocab_registry):
        """Runtime packs should override core items."""
        # First register a "core-like" pack
        core_data = {
            "poses": {
                "pose:standing": {"label": "Core Standing"},
            },
        }
        vocab_registry.register_pack("core-pack", core_data, layer="core", label="Core")

        # Then register runtime override
        runtime_data = {
            "poses": {
                "pose:standing": {"label": "Runtime Standing"},
            },
        }
        vocab_registry.register_pack("runtime-pack", runtime_data, label="Runtime")

        # Runtime should win (has higher layer)
        pose = vocab_registry.get("poses", "pose:standing")
        assert pose.label == "Runtime Standing"

        # Unregister runtime - core should be visible
        vocab_registry.unregister_pack("runtime-pack")

        pose = vocab_registry.get("poses", "pose:standing")
        assert pose.label == "Core Standing"

    def test_packs_property_includes_runtime(self, vocab_registry):
        """packs property should include runtime packs."""
        pack_data = {"poses": {"pose:test": {"label": "Test"}}}

        vocab_registry.register_pack("runtime-pack", pack_data, label="Runtime Pack")

        packs = vocab_registry.packs
        pack_ids = [p.id for p in packs]

        assert "runtime-pack" in pack_ids

    def test_register_pack_allow_overwrite(self, vocab_registry):
        """allow_overwrite=True should replace existing pack."""
        pack_data1 = {"poses": {"pose:v1": {"label": "V1"}}}
        pack_data2 = {"poses": {"pose:v2": {"label": "V2"}}}

        vocab_registry.register_pack("my-pack", pack_data1, label="V1")
        assert vocab_registry.get("poses", "pose:v1") is not None

        vocab_registry.register_pack("my-pack", pack_data2, label="V2", allow_overwrite=True)

        # Old item gone, new item present
        assert vocab_registry.get("poses", "pose:v1") is None
        assert vocab_registry.get("poses", "pose:v2") is not None

    def test_register_pack_rebuilds_indices(self, vocab_registry):
        """register_pack should rebuild pose/keyword indices."""
        pack_data = {
            "poses": {
                "pose:indexed": {
                    "label": "Indexed Pose",
                    "category": "test_category",
                    "detector_labels": ["indexed_label"],
                },
            },
        }

        vocab_registry.register_pack("index-test", pack_data, label="Index Test")

        # Category index should be updated
        poses_in_cat = vocab_registry.poses_in_category("test_category")
        assert "pose:indexed" in poses_in_cat

        # Detector mapping should be updated
        mapped = vocab_registry.map_detector_to_pose("indexed_label")
        assert mapped == "pose:indexed"

    def test_unregister_pack_rebuilds_indices(self, vocab_registry):
        """unregister_pack should rebuild indices."""
        pack_data = {
            "poses": {
                "pose:temp_indexed": {
                    "label": "Temp Indexed",
                    "category": "temp_category",
                },
            },
        }

        vocab_registry.register_pack("temp-pack", pack_data, label="Temp")

        assert "pose:temp_indexed" in vocab_registry.poses_in_category("temp_category")

        vocab_registry.unregister_pack("temp-pack")

        # Should no longer be in index
        assert "pose:temp_indexed" not in vocab_registry.poses_in_category("temp_category")
