"""
Registry utilities for manifest-based discovery, dependency resolution,
and simple key-value registries.

Usage:
    from pixsim7.backend.main.lib.registry import (
        # Discovery
        discover_manifests,
        resolve_load_order,
        # Simple registry
        SimpleRegistry,
        create_registry,
    )

    # Discover all subdirectories containing manifest.py
    manifests = discover_manifests(
        base_dir="path/to/plugins",
        manifest_file="manifest.py",
    )

    # Resolve load order based on dependencies
    load_order = resolve_load_order(
        items={"a": ["b"], "b": [], "c": ["a", "b"]},
    )
    # Returns: ["b", "a", "c"]

    # Create a simple registry
    class MyRegistry(SimpleRegistry[str, MyItem]):
        pass

    registry = MyRegistry()
    registry.register("key", item)
"""

from .discovery import (
    discover_manifests,
    discover_nested_manifests,
    DiscoveredManifest,
    NameValidator,
    DEFAULT_NAME_PATTERN,
    DEFAULT_RESERVED_NAMES,
)
from .dependencies import (
    resolve_load_order,
    resolve_load_order_with_getter,
    find_dependents,
    CircularDependencyError,
    MissingDependencyError,
)
from .simple import (
    SimpleRegistry,
    DuplicateKeyError,
    KeyNotFoundError,
    create_registry,
)

__all__ = [
    # Discovery
    "discover_manifests",
    "discover_nested_manifests",
    "DiscoveredManifest",
    "NameValidator",
    "DEFAULT_NAME_PATTERN",
    "DEFAULT_RESERVED_NAMES",
    # Dependencies
    "resolve_load_order",
    "resolve_load_order_with_getter",
    "find_dependents",
    "CircularDependencyError",
    "MissingDependencyError",
    # Simple registry
    "SimpleRegistry",
    "DuplicateKeyError",
    "KeyNotFoundError",
    "create_registry",
]
