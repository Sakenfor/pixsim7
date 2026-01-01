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
