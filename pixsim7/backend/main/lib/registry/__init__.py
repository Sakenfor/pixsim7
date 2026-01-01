"""
Registry utilities for manifest-based discovery and dependency resolution.

Usage:
    from pixsim7.backend.main.lib.registry import (
        discover_manifests,
        resolve_load_order,
        DiscoveredManifest,
        CircularDependencyError,
        MissingDependencyError,
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
    CircularDependencyError,
    MissingDependencyError,
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
    "CircularDependencyError",
    "MissingDependencyError",
]
