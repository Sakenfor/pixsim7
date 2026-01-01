"""
Tests for shared registry utilities (discovery and dependency resolution).
"""

import pytest
from pathlib import Path
import tempfile
import os

from pixsim7.backend.main.lib.registry import (
    discover_manifests,
    discover_nested_manifests,
    resolve_load_order,
    DiscoveredManifest,
    NameValidator,
    CircularDependencyError,
    MissingDependencyError,
    DEFAULT_NAME_PATTERN,
    DEFAULT_RESERVED_NAMES,
    SimpleRegistry,
    DuplicateKeyError,
    KeyNotFoundError,
    create_registry,
    WorldMergeMixin,
    MergeResult,
    deep_merge_dicts,
    merge_by_id,
)


class TestDiscoverManifests:
    """Tests for discover_manifests function."""

    def test_discovers_manifests_in_subdirs(self, tmp_path: Path):
        """Should find manifest.py files in immediate subdirectories."""
        # Create test structure
        (tmp_path / "plugin_a").mkdir()
        (tmp_path / "plugin_a" / "manifest.py").write_text("# manifest")
        (tmp_path / "plugin_b").mkdir()
        (tmp_path / "plugin_b" / "manifest.py").write_text("# manifest")
        (tmp_path / "no_manifest").mkdir()  # No manifest.py

        manifests = discover_manifests(tmp_path)

        assert len(manifests) == 2
        names = [m.name for m in manifests]
        assert "plugin_a" in names
        assert "plugin_b" in names
        assert "no_manifest" not in names

    def test_skips_hidden_dirs(self, tmp_path: Path):
        """Should skip directories starting with dot."""
        (tmp_path / ".hidden").mkdir()
        (tmp_path / ".hidden" / "manifest.py").write_text("# manifest")
        (tmp_path / "visible").mkdir()
        (tmp_path / "visible" / "manifest.py").write_text("# manifest")

        manifests = discover_manifests(tmp_path, skip_hidden=True)

        assert len(manifests) == 1
        assert manifests[0].name == "visible"

    def test_skips_dunder_dirs(self, tmp_path: Path):
        """Should skip directories starting with underscore."""
        (tmp_path / "_private").mkdir()
        (tmp_path / "_private" / "manifest.py").write_text("# manifest")
        (tmp_path / "public").mkdir()
        (tmp_path / "public" / "manifest.py").write_text("# manifest")

        manifests = discover_manifests(tmp_path, skip_dunder=True)

        assert len(manifests) == 1
        assert manifests[0].name == "public"

    def test_validates_names_with_validator(self, tmp_path: Path):
        """Should skip invalid names when validator is provided."""
        validator = NameValidator(
            pattern=DEFAULT_NAME_PATTERN,
            reserved={"reserved"},
        )

        # Valid names
        (tmp_path / "valid-plugin").mkdir()
        (tmp_path / "valid-plugin" / "manifest.py").write_text("# manifest")
        (tmp_path / "valid_plugin2").mkdir()
        (tmp_path / "valid_plugin2" / "manifest.py").write_text("# manifest")

        # Invalid names
        (tmp_path / "InvalidCase").mkdir()  # uppercase
        (tmp_path / "InvalidCase" / "manifest.py").write_text("# manifest")
        (tmp_path / "reserved").mkdir()  # reserved name
        (tmp_path / "reserved" / "manifest.py").write_text("# manifest")

        manifests = discover_manifests(tmp_path, validator=validator)

        names = [m.name for m in manifests]
        assert "valid-plugin" in names
        assert "valid_plugin2" in names
        assert "InvalidCase" not in names
        assert "reserved" not in names

    def test_returns_empty_for_nonexistent_dir(self, tmp_path: Path):
        """Should return empty list for non-existent directory."""
        manifests = discover_manifests(tmp_path / "nonexistent")
        assert manifests == []

    def test_results_sorted_by_name(self, tmp_path: Path):
        """Should return results sorted alphabetically."""
        for name in ["zebra", "alpha", "middle"]:
            (tmp_path / name).mkdir()
            (tmp_path / name / "manifest.py").write_text("# manifest")

        manifests = discover_manifests(tmp_path)

        names = [m.name for m in manifests]
        assert names == ["alpha", "middle", "zebra"]


class TestDiscoverNestedManifests:
    """Tests for discover_nested_manifests function."""

    def test_discovers_nested_manifests(self, tmp_path: Path):
        """Should find manifests in nested subdirectory structure."""
        # Create packages/plugins/stealth/backend/manifest.py structure
        (tmp_path / "stealth" / "backend").mkdir(parents=True)
        (tmp_path / "stealth" / "backend" / "manifest.py").write_text("# manifest")
        (tmp_path / "personality" / "backend").mkdir(parents=True)
        (tmp_path / "personality" / "backend" / "manifest.py").write_text("# manifest")

        manifests = discover_nested_manifests(tmp_path, nested_subdir="backend")

        assert len(manifests) == 2
        names = [m.name for m in manifests]
        assert "stealth" in names
        assert "personality" in names

    def test_package_dir_points_to_nested(self, tmp_path: Path):
        """package_dir should point to the nested subdir (for imports)."""
        (tmp_path / "plugin" / "backend").mkdir(parents=True)
        (tmp_path / "plugin" / "backend" / "manifest.py").write_text("# manifest")

        manifests = discover_nested_manifests(tmp_path, nested_subdir="backend")

        assert len(manifests) == 1
        assert manifests[0].package_dir == tmp_path / "plugin" / "backend"
        assert manifests[0].root_dir == tmp_path / "plugin"

    def test_skips_dirs_without_nested_subdir(self, tmp_path: Path):
        """Should skip directories that don't have the nested subdir."""
        # Has nested subdir
        (tmp_path / "has_backend" / "backend").mkdir(parents=True)
        (tmp_path / "has_backend" / "backend" / "manifest.py").write_text("# manifest")

        # No backend subdir
        (tmp_path / "no_backend").mkdir()
        (tmp_path / "no_backend" / "manifest.py").write_text("# manifest")  # Wrong level

        manifests = discover_nested_manifests(tmp_path, nested_subdir="backend")

        assert len(manifests) == 1
        assert manifests[0].name == "has_backend"


class TestNameValidator:
    """Tests for NameValidator."""

    def test_validates_valid_names(self):
        """Should accept valid lowercase alphanumeric names."""
        # Use empty reserved set to test pattern only
        validator = NameValidator(reserved=set())

        assert validator.is_valid("myplugin")
        assert validator.is_valid("my-plugin")
        assert validator.is_valid("my_plugin")
        assert validator.is_valid("plugin123")
        assert validator.is_valid("a")

    def test_rejects_invalid_names(self):
        """Should reject names that don't match pattern."""
        validator = NameValidator()

        assert not validator.is_valid("Plugin")  # uppercase
        assert not validator.is_valid("123plugin")  # starts with number
        assert not validator.is_valid("plugin!")  # special char
        assert not validator.is_valid("")  # empty

    def test_rejects_reserved_names(self):
        """Should reject reserved names."""
        validator = NameValidator(reserved={"core", "system"})

        assert not validator.is_valid("core")
        assert not validator.is_valid("system")
        assert validator.is_valid("mycore")  # not exact match

    def test_validate_returns_error_message(self):
        """validate() should return error message or None."""
        validator = NameValidator(reserved={"reserved"})

        assert validator.validate("valid-name") is None
        assert "Reserved" in validator.validate("reserved")
        assert "Invalid" in validator.validate("InvalidName")


class TestResolveLoadOrder:
    """Tests for resolve_load_order function."""

    def test_simple_dependencies(self):
        """Should resolve simple linear dependencies."""
        deps = {
            "a": ["b"],
            "b": ["c"],
            "c": [],
        }

        order = resolve_load_order(deps)

        # c must come before b, b must come before a
        assert order.index("c") < order.index("b")
        assert order.index("b") < order.index("a")

    def test_multiple_dependencies(self):
        """Should resolve items with multiple dependencies."""
        deps = {
            "app": ["db", "cache"],
            "db": [],
            "cache": [],
        }

        order = resolve_load_order(deps)

        # db and cache must come before app
        assert order.index("db") < order.index("app")
        assert order.index("cache") < order.index("app")

    def test_no_dependencies(self):
        """Should handle items with no dependencies."""
        deps = {
            "a": [],
            "b": [],
            "c": [],
        }

        order = resolve_load_order(deps)

        assert set(order) == {"a", "b", "c"}

    def test_detects_circular_dependencies(self):
        """Should raise CircularDependencyError on cycles."""
        deps = {
            "a": ["b"],
            "b": ["c"],
            "c": ["a"],  # cycle!
        }

        with pytest.raises(CircularDependencyError) as exc_info:
            resolve_load_order(deps)

        assert "a" in str(exc_info.value) or "b" in str(exc_info.value) or "c" in str(exc_info.value)

    def test_detects_self_dependency(self):
        """Should detect self-referential dependency."""
        deps = {
            "a": ["a"],  # self-dependency
        }

        with pytest.raises(CircularDependencyError):
            resolve_load_order(deps)

    def test_strict_mode_raises_on_missing(self):
        """Should raise MissingDependencyError in strict mode."""
        deps = {
            "a": ["nonexistent"],
        }

        with pytest.raises(MissingDependencyError) as exc_info:
            resolve_load_order(deps, strict=True)

        assert exc_info.value.missing_dep == "nonexistent"
        assert exc_info.value.item_id == "a"

    def test_non_strict_mode_ignores_missing(self):
        """Should ignore missing dependencies in non-strict mode."""
        deps = {
            "a": ["nonexistent"],
            "b": [],
        }

        order = resolve_load_order(deps, strict=False)

        assert set(order) == {"a", "b"}

    def test_diamond_dependency(self):
        """Should handle diamond-shaped dependency graphs."""
        #     a
        #    / \
        #   b   c
        #    \ /
        #     d
        deps = {
            "a": ["b", "c"],
            "b": ["d"],
            "c": ["d"],
            "d": [],
        }

        order = resolve_load_order(deps)

        # d must come first, a must come last
        assert order.index("d") < order.index("b")
        assert order.index("d") < order.index("c")
        assert order.index("b") < order.index("a")
        assert order.index("c") < order.index("a")

    def test_complex_dependency_graph(self):
        """Should handle complex dependency graphs."""
        deps = {
            "auth": ["db", "cache"],
            "api": ["auth", "logging"],
            "db": [],
            "cache": ["db"],
            "logging": [],
            "worker": ["db", "cache", "logging"],
        }

        order = resolve_load_order(deps)

        # Verify all constraints
        assert order.index("db") < order.index("auth")
        assert order.index("cache") < order.index("auth")
        assert order.index("auth") < order.index("api")
        assert order.index("logging") < order.index("api")
        assert order.index("db") < order.index("worker")
        assert order.index("cache") < order.index("worker")
        assert order.index("logging") < order.index("worker")


class TestSimpleRegistry:
    """Tests for SimpleRegistry class."""

    def test_register_and_get(self):
        """Should register and retrieve items."""
        registry = SimpleRegistry[str, int](name="test")
        registry.register("one", 1)
        registry.register("two", 2)

        assert registry.get("one") == 1
        assert registry.get("two") == 2

    def test_get_raises_on_missing(self):
        """Should raise KeyNotFoundError for missing key."""
        registry = SimpleRegistry[str, int](name="test")

        with pytest.raises(KeyNotFoundError) as exc_info:
            registry.get("missing")

        assert exc_info.value.key == "missing"
        assert "test" in str(exc_info.value)

    def test_get_or_none(self):
        """Should return None for missing key."""
        registry = SimpleRegistry[str, int](name="test")
        registry.register("exists", 42)

        assert registry.get_or_none("exists") == 42
        assert registry.get_or_none("missing") is None

    def test_has(self):
        """Should check if key exists."""
        registry = SimpleRegistry[str, int](name="test")
        registry.register("exists", 1)

        assert registry.has("exists")
        assert not registry.has("missing")

    def test_unregister(self):
        """Should remove items."""
        registry = SimpleRegistry[str, int](name="test")
        registry.register("key", 42)

        removed = registry.unregister("key")

        assert removed == 42
        assert not registry.has("key")
        assert registry.unregister("missing") is None

    def test_clear(self):
        """Should remove all items."""
        registry = SimpleRegistry[str, int](name="test")
        registry.register("a", 1)
        registry.register("b", 2)

        registry.clear()

        assert len(registry) == 0

    def test_keys_values_items(self):
        """Should return keys, values, and items."""
        registry = SimpleRegistry[str, int](name="test")
        registry.register("a", 1)
        registry.register("b", 2)

        assert set(registry.keys()) == {"a", "b"}
        assert set(registry.values()) == {1, 2}
        assert set(registry.items()) == {("a", 1), ("b", 2)}

    def test_len_and_contains(self):
        """Should support len() and 'in' operator."""
        registry = SimpleRegistry[str, int](name="test")
        registry.register("key", 42)

        assert len(registry) == 1
        assert "key" in registry
        assert "missing" not in registry

    def test_iteration(self):
        """Should iterate over keys."""
        registry = SimpleRegistry[str, int](name="test")
        registry.register("a", 1)
        registry.register("b", 2)

        keys = list(registry)

        assert set(keys) == {"a", "b"}

    def test_duplicate_overwrite_allowed(self):
        """Should allow overwriting by default."""
        registry = SimpleRegistry[str, int](name="test", allow_overwrite=True)
        registry.register("key", 1)
        registry.register("key", 2)

        assert registry.get("key") == 2

    def test_duplicate_overwrite_prevented(self):
        """Should raise DuplicateKeyError when overwrite disabled."""
        registry = SimpleRegistry[str, int](name="test", allow_overwrite=False)
        registry.register("key", 1)

        with pytest.raises(DuplicateKeyError) as exc_info:
            registry.register("key", 2)

        assert exc_info.value.key == "key"

    def test_register_item_with_key_extraction(self):
        """Should extract key from item using _get_item_key."""
        class Item:
            def __init__(self, id: str, value: int):
                self.id = id
                self.value = value

        class ItemRegistry(SimpleRegistry[str, Item]):
            def _get_item_key(self, item: Item) -> str:
                return item.id

        registry = ItemRegistry(name="items")
        item = Item("my-id", 42)

        key = registry.register_item(item)

        assert key == "my-id"
        assert registry.get("my-id") is item

    def test_register_item_raises_without_override(self):
        """Should raise if _get_item_key not overridden."""
        registry = SimpleRegistry[str, int](name="test")

        with pytest.raises(NotImplementedError):
            registry.register_item(42)

    def test_reset_with_seed_defaults(self):
        """Should clear and re-seed on reset."""
        class SeededRegistry(SimpleRegistry[str, int]):
            def _seed_defaults(self):
                self.register("default", 100)

        registry = SeededRegistry(name="seeded", seed_on_init=True)

        # Should have default
        assert registry.get("default") == 100

        # Add another item
        registry.register("custom", 200)
        assert len(registry) == 2

        # Reset should clear and re-seed
        registry.reset()

        assert len(registry) == 1
        assert registry.get("default") == 100
        assert not registry.has("custom")


class TestCreateRegistry:
    """Tests for create_registry helper."""

    def test_create_basic_registry(self):
        """Should create a basic registry."""
        registry = create_registry("test")
        registry.register("key", "value")

        assert registry.get("key") == "value"

    def test_create_registry_with_key_extractor(self):
        """Should create registry with custom key extraction."""
        class Item:
            def __init__(self, name: str):
                self.name = name

        registry = create_registry("items", get_key=lambda i: i.name)
        item = Item("my-item")

        registry.register_item(item)

        assert registry.get("my-item") is item


class TestDeepMergeDicts:
    """Tests for deep_merge_dicts utility."""

    def test_shallow_merge(self):
        """Should merge top-level keys."""
        base = {"a": 1, "b": 2}
        override = {"b": 3, "c": 4}

        result = deep_merge_dicts(base, override)

        assert result == {"a": 1, "b": 3, "c": 4}

    def test_nested_merge(self):
        """Should recursively merge nested dicts."""
        base = {"outer": {"a": 1, "b": 2}}
        override = {"outer": {"b": 3, "c": 4}}

        result = deep_merge_dicts(base, override)

        assert result == {"outer": {"a": 1, "b": 3, "c": 4}}

    def test_list_replace(self):
        """Lists should be replaced, not merged."""
        base = {"items": [1, 2, 3]}
        override = {"items": [4, 5]}

        result = deep_merge_dicts(base, override)

        assert result == {"items": [4, 5]}

    def test_does_not_mutate_originals(self):
        """Should not mutate input dicts."""
        base = {"a": {"nested": 1}}
        override = {"a": {"nested": 2}}

        result = deep_merge_dicts(base, override)

        assert base["a"]["nested"] == 1
        assert override["a"]["nested"] == 2
        assert result["a"]["nested"] == 2


class TestMergeById:
    """Tests for merge_by_id utility."""

    def test_merge_by_id(self):
        """Should merge items by ID field."""
        base = [
            {"id": "a", "value": 1},
            {"id": "b", "value": 2},
        ]
        override = [
            {"id": "b", "value": 20},  # Override existing
            {"id": "c", "value": 3},   # Add new
        ]

        merged, overridden, added = merge_by_id(base, override)

        assert len(merged) == 3
        assert overridden == ["b"]
        assert added == ["c"]

        # Check values
        by_id = {item["id"]: item for item in merged}
        assert by_id["a"]["value"] == 1
        assert by_id["b"]["value"] == 20
        assert by_id["c"]["value"] == 3

    def test_custom_id_field(self):
        """Should support custom ID field name."""
        base = [{"name": "a", "val": 1}]
        override = [{"name": "a", "val": 2}]

        merged, _, _ = merge_by_id(base, override, id_field="name")

        assert merged[0]["val"] == 2

    def test_skip_items_without_id(self):
        """Should skip items without ID field."""
        base = [{"id": "a", "value": 1}]
        override = [{"value": 2}]  # No id

        merged, overridden, added = merge_by_id(base, override)

        assert len(merged) == 1
        assert overridden == []
        assert added == []


class TestWorldMergeMixin:
    """Tests for WorldMergeMixin."""

    def test_collect_from_packages(self):
        """Should collect items from all packages."""
        from dataclasses import dataclass

        @dataclass
        class Item:
            name: str
            value: int

        @dataclass
        class Package:
            id: str
            items: dict

        packages = [
            Package("pkg1", {"a": Item("A", 1)}),
            Package("pkg2", {"b": Item("B", 2)}),
        ]

        class TestRegistry(WorldMergeMixin[Package, Item]):
            meta_key = "config"
            items_key = "items"

            def _get_packages(self):
                return packages

            def _collect_base_items(self, pkg):
                return pkg.items

        registry = TestRegistry()
        result = registry.get_merged_items(None)

        assert "a" in result.items
        assert "b" in result.items
        assert result.items["a"].value == 1
        assert result.items["b"].value == 2

    def test_later_package_overrides(self):
        """Later packages should override earlier ones."""
        from dataclasses import dataclass

        @dataclass
        class Item:
            value: int

        @dataclass
        class Package:
            items: dict

        packages = [
            Package({"shared": Item(1)}),
            Package({"shared": Item(2)}),  # Overrides
        ]

        class TestRegistry(WorldMergeMixin[Package, Item]):
            meta_key = "config"
            items_key = "items"

            def _get_packages(self):
                return packages

            def _collect_base_items(self, pkg):
                return pkg.items

        registry = TestRegistry()
        result = registry.get_merged_items(None)

        assert result.items["shared"].value == 2

    def test_world_override_merge(self):
        """Should apply world.meta overrides."""
        from dataclasses import dataclass

        @dataclass
        class Item:
            name: str
            value: int

        @dataclass
        class Package:
            items: dict

        packages = [Package({"a": Item("A", 1)})]

        class TestRegistry(WorldMergeMixin[Package, Item]):
            meta_key = "my_config"
            items_key = "definitions"

            def _get_packages(self):
                return packages

            def _collect_base_items(self, pkg):
                return pkg.items

            def _merge_item(self, base, override):
                # Simple merge: update value if provided
                from copy import deepcopy
                merged = deepcopy(base)
                if "value" in override:
                    merged.value = override["value"]
                return merged

        registry = TestRegistry()
        world_meta = {
            "my_config": {
                "definitions": {
                    "a": {"value": 100},  # Override
                }
            }
        }

        result = registry.get_merged_items(world_meta)

        assert result.items["a"].value == 100
        assert result.items["a"].name == "A"  # Unchanged
        assert result.overridden_ids == ["a"]

    def test_world_add_new_items(self):
        """Should add new items from world.meta if _create_item implemented."""
        from dataclasses import dataclass

        @dataclass
        class Item:
            name: str
            value: int

        @dataclass
        class Package:
            items: dict

        packages = [Package({"a": Item("A", 1)})]

        class TestRegistry(WorldMergeMixin[Package, Item]):
            meta_key = "config"
            items_key = "items"

            def _get_packages(self):
                return packages

            def _collect_base_items(self, pkg):
                return pkg.items

            def _create_item(self, item_id, data):
                return Item(name=data.get("name", item_id), value=data.get("value", 0))

        registry = TestRegistry()
        world_meta = {
            "config": {
                "items": {
                    "b": {"name": "B", "value": 2},
                }
            }
        }

        result = registry.get_merged_items(world_meta)

        assert "b" in result.items
        assert result.items["b"].value == 2
        assert result.added_ids == ["b"]

    def test_validation_errors(self):
        """Should report validation errors."""
        from dataclasses import dataclass

        @dataclass
        class Item:
            value: int

        @dataclass
        class Package:
            items: dict

        packages = [Package({"a": Item(1)})]

        class TestRegistry(WorldMergeMixin[Package, Item]):
            meta_key = "config"
            items_key = "items"

            def _get_packages(self):
                return packages

            def _collect_base_items(self, pkg):
                return pkg.items

            def _validate_override(self, item_id, override):
                if "value" in override and override["value"] < 0:
                    return "value must be non-negative"
                return None

        registry = TestRegistry()
        world_meta = {
            "config": {
                "items": {
                    "a": {"value": -1},
                }
            }
        }

        result = registry.get_merged_items(world_meta)

        assert len(result.errors) == 1
        assert "value must be non-negative" in result.errors[0]
        # Original should be unchanged since validation failed
        assert result.items["a"].value == 1


class TestPackageRegistryClearFunctions:
    """Tests for package registry clear/reset functions."""

    def test_clear_composition_packages(self):
        """Should clear and allow re-registration of composition packages."""
        from pixsim7.backend.main.domain.composition import (
            clear_composition_packages,
            register_core_composition_package,
            list_composition_packages,
        )

        # Clear the registry
        clear_composition_packages()
        assert len(list_composition_packages()) == 0

        # Re-register should work
        register_core_composition_package()
        packages = list_composition_packages()
        assert "core.base" in packages
        assert len(packages) >= 1

    def test_clear_npc_surface_packages(self):
        """Should clear and allow re-registration of NPC surface packages."""
        from pixsim7.backend.main.domain.game.entities.npc_surfaces import (
            clear_npc_surface_packages,
            register_core_surface_packages,
            list_npc_surface_packages,
        )

        # Clear the registry
        clear_npc_surface_packages()
        assert len(list_npc_surface_packages()) == 0

        # Re-register should work
        register_core_surface_packages()
        packages = list_npc_surface_packages()
        assert "core.portrait" in packages
        assert "core.mood" in packages

    def test_clear_stat_packages(self):
        """Should clear and allow re-registration of stat packages."""
        from pixsim7.backend.main.domain.game.stats import (
            clear_stat_packages,
            register_core_stat_packages,
            list_stat_packages,
        )

        # Clear the registry
        clear_stat_packages()
        assert len(list_stat_packages()) == 0

        # Re-register should work
        register_core_stat_packages()
        packages = list_stat_packages()
        assert "core.relationships" in packages
        assert len(packages) >= 1
