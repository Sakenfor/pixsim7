"""
Nested Registry - two-level key-value registry.

Provides a reusable pattern for registries that organize items by namespace.
Example: vocab_type -> item_id -> item

Usage:
    from pixsim7.backend.main.lib.registry import NestedRegistry

    # Basic usage
    registry = NestedRegistry[str, str, PoseDef](name="vocab")
    registry.register("poses", "pose:standing", pose_def)
    pose = registry.get("poses", "pose:standing")
    all_poses = registry.all_of("poses")

    # With duplicate prevention
    registry = NestedRegistry[str, str, Item](
        name="items",
        allow_overwrite=False,
    )

    # Iterate namespaces
    for ns in registry.namespaces():
        items = registry.all_of(ns)
"""

from __future__ import annotations

from typing import (
    Callable,
    Dict,
    Generic,
    Iterator,
    List,
    Optional,
    Set,
    TypeVar,
)
import structlog

from pixsim7.backend.main.lib.registry.simple import (
    SimpleRegistry,
    DuplicateKeyError,
)

logger = structlog.get_logger(__name__)

NS = TypeVar("NS")  # Namespace type (typically str)
K = TypeVar("K")    # Key type (typically str)
V = TypeVar("V")    # Value type


class NestedRegistry(Generic[NS, K, V]):
    """
    Two-level registry: namespace -> key -> value.

    Each namespace is backed by a SimpleRegistry, providing consistent
    error handling, logging, and duplicate protection.

    Features:
    - Type-safe namespace, key, and value types
    - Optional duplicate key prevention (per namespace)
    - Namespace-scoped operations (all_of, clear_namespace)
    - Iteration over namespaces and items
    - Logging of operations

    Args:
        name: Registry name for logging/errors. Defaults to class name.
        allow_overwrite: If False, raise DuplicateKeyError on duplicate keys.
        log_operations: If True, log register/unregister operations.
        auto_create_namespace: If True, create namespace on first register.
    """

    def __init__(
        self,
        name: Optional[str] = None,
        allow_overwrite: bool = True,
        log_operations: bool = True,
        auto_create_namespace: bool = True,
    ):
        self._name = name or self.__class__.__name__
        self._allow_overwrite = allow_overwrite
        self._log_operations = log_operations
        self._auto_create_namespace = auto_create_namespace
        self._namespaces: Dict[NS, SimpleRegistry[K, V]] = {}

    @property
    def name(self) -> str:
        """Registry name for logging/errors."""
        return self._name

    # =========================================================================
    # Namespace Management
    # =========================================================================

    def add_namespace(self, namespace: NS) -> None:
        """
        Add a namespace to the registry.

        Args:
            namespace: The namespace to add.

        Raises:
            ValueError: If namespace already exists.
        """
        if namespace in self._namespaces:
            raise ValueError(f"Namespace '{namespace}' already exists in {self._name}")

        self._namespaces[namespace] = SimpleRegistry(
            name=f"{self._name}:{namespace}",
            allow_overwrite=self._allow_overwrite,
            log_operations=self._log_operations,
        )

        if self._log_operations:
            logger.debug(f"Added namespace to {self._name}", namespace=str(namespace))

    def has_namespace(self, namespace: NS) -> bool:
        """Check if a namespace exists."""
        return namespace in self._namespaces

    def namespaces(self) -> List[NS]:
        """Get all namespace keys."""
        return list(self._namespaces.keys())

    def clear_namespace(self, namespace: NS) -> None:
        """Clear all items in a namespace."""
        if namespace in self._namespaces:
            self._namespaces[namespace].clear()

    def remove_namespace(self, namespace: NS) -> bool:
        """
        Remove a namespace and all its items.

        Returns:
            True if namespace was removed, False if it didn't exist.
        """
        if namespace in self._namespaces:
            count = len(self._namespaces[namespace])
            del self._namespaces[namespace]

            if self._log_operations:
                logger.debug(
                    f"Removed namespace from {self._name}",
                    namespace=str(namespace),
                    items_removed=count,
                )
            return True
        return False

    # =========================================================================
    # Item Operations
    # =========================================================================

    def register(self, namespace: NS, key: K, item: V) -> None:
        """
        Register an item in a namespace.

        Args:
            namespace: The namespace to register in.
            key: The key to register under.
            item: The item to register.

        Raises:
            DuplicateKeyError: If key exists and allow_overwrite=False.
            ValueError: If namespace doesn't exist and auto_create_namespace=False.
        """
        if namespace not in self._namespaces:
            if self._auto_create_namespace:
                self.add_namespace(namespace)
            else:
                raise ValueError(
                    f"Namespace '{namespace}' does not exist in {self._name}"
                )

        self._namespaces[namespace].register(key, item)

    def get(self, namespace: NS, key: K) -> Optional[V]:
        """
        Get an item by namespace and key.

        Args:
            namespace: The namespace to look in.
            key: The key to look up.

        Returns:
            The item, or None if not found.
        """
        ns_registry = self._namespaces.get(namespace)
        if ns_registry is None:
            return None
        return ns_registry.get_or_none(key)

    def get_or_raise(self, namespace: NS, key: K) -> V:
        """
        Get an item, raising if not found.

        Args:
            namespace: The namespace to look in.
            key: The key to look up.

        Returns:
            The item.

        Raises:
            KeyError: If namespace or key not found.
        """
        ns_registry = self._namespaces.get(namespace)
        if ns_registry is None:
            raise KeyError(f"Namespace '{namespace}' not found in {self._name}")
        return ns_registry.get(key)

    def has(self, namespace: NS, key: K) -> bool:
        """Check if an item exists."""
        ns_registry = self._namespaces.get(namespace)
        if ns_registry is None:
            return False
        return ns_registry.has(key)

    def unregister(self, namespace: NS, key: K) -> Optional[V]:
        """
        Unregister an item.

        Args:
            namespace: The namespace to look in.
            key: The key to remove.

        Returns:
            The removed item, or None if not found.
        """
        ns_registry = self._namespaces.get(namespace)
        if ns_registry is None:
            return None
        return ns_registry.unregister(key)

    # =========================================================================
    # Query Operations
    # =========================================================================

    def all_of(self, namespace: NS) -> List[V]:
        """Get all items in a namespace."""
        ns_registry = self._namespaces.get(namespace)
        if ns_registry is None:
            return []
        return ns_registry.values()

    def keys_of(self, namespace: NS) -> List[K]:
        """Get all keys in a namespace."""
        ns_registry = self._namespaces.get(namespace)
        if ns_registry is None:
            return []
        return ns_registry.keys()

    def items_of(self, namespace: NS) -> List[tuple[K, V]]:
        """Get all (key, value) pairs in a namespace."""
        ns_registry = self._namespaces.get(namespace)
        if ns_registry is None:
            return []
        return ns_registry.items()

    def count_of(self, namespace: NS) -> int:
        """Get item count in a namespace."""
        ns_registry = self._namespaces.get(namespace)
        if ns_registry is None:
            return 0
        return len(ns_registry)

    def total_count(self) -> int:
        """Get total item count across all namespaces."""
        return sum(len(ns) for ns in self._namespaces.values())

    def all_items(self) -> List[tuple[NS, K, V]]:
        """Get all (namespace, key, value) triples."""
        result: List[tuple[NS, K, V]] = []
        for namespace, ns_registry in self._namespaces.items():
            for key, value in ns_registry.items():
                result.append((namespace, key, value))
        return result

    # =========================================================================
    # Bulk Operations
    # =========================================================================

    def clear(self) -> None:
        """Clear all namespaces and items."""
        total = self.total_count()
        ns_count = len(self._namespaces)
        self._namespaces.clear()

        if self._log_operations and total > 0:
            logger.debug(
                f"Cleared {self._name}",
                namespaces=ns_count,
                items=total,
            )

    def reset(self) -> None:
        """
        Clear and re-seed the registry.

        Calls:
        1. clear() - remove all namespaces and items
        2. _seed_defaults() - re-seed default items
        """
        self.clear()
        self._seed_defaults()

    def _seed_defaults(self) -> None:
        """
        Seed default items on init/reset.

        Override this to define default items that should be registered
        when the registry is reset.
        """
        pass

    # =========================================================================
    # Dunder Methods
    # =========================================================================

    def __len__(self) -> int:
        """Get total item count across all namespaces."""
        return self.total_count()

    def __contains__(self, namespace: NS) -> bool:
        """Check if namespace exists (supports 'in' operator)."""
        return namespace in self._namespaces

    def __iter__(self) -> Iterator[NS]:
        """Iterate over namespaces."""
        return iter(self._namespaces)

    def __getitem__(self, namespace: NS) -> SimpleRegistry[K, V]:
        """
        Get the SimpleRegistry for a namespace.

        Allows dict-like access: registry["poses"]["pose:standing"]
        """
        if namespace not in self._namespaces:
            raise KeyError(f"Namespace '{namespace}' not found in {self._name}")
        return self._namespaces[namespace]


__all__ = [
    "NestedRegistry",
]
