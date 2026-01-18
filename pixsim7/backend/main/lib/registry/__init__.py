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
    create_registry,
)
from .errors import (
    DuplicateKeyError,
    KeyNotFoundError,
)
from .base import (
    RegistryBase,
    RegistryObserverMixin,
)
from .cleanup import (
    RegistryCleanupResult,
)
from .group import (
    RegistryGroup,
)
from .manager import (
    RegistryManager,
    get_registry_manager,
    set_registry_manager,
)
from .ownership import (
    PluginOwned,
    get_plugin_owner,
)
from .nested import (
    NestedRegistry,
)
from .layered import (
    LayeredRegistry,
    LayeredNestedRegistry,
)
from .pack import (
    PackRegistryBase,
    PackItemRef,
    SimplePackRegistryBase,
    SimplePackItemRef,
)
from .world_merge import (
    WorldMergeMixin,
    MergeStrategy,
    MergeResult,
    deep_merge_dicts,
    merge_by_id,
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
    # Base and mixins
    "RegistryBase",
    "RegistryObserverMixin",
    "RegistryCleanupResult",
    "RegistryGroup",
    "RegistryManager",
    "get_registry_manager",
    "set_registry_manager",
    "PluginOwned",
    "get_plugin_owner",
    # Nested registry
    "NestedRegistry",
    # Layered registry
    "LayeredRegistry",
    "LayeredNestedRegistry",
    # Pack registry
    "PackRegistryBase",
    "PackItemRef",
    "SimplePackRegistryBase",
    "SimplePackItemRef",
    # World merge
    "WorldMergeMixin",
    "MergeStrategy",
    "MergeResult",
    "deep_merge_dicts",
    "merge_by_id",
]
