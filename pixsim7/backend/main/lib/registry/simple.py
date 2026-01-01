"""
Simple Registry - generic base class for key-value registries.

Provides a reusable pattern for registries that store items by ID/key.
Handles common operations: register, get, has, list, unregister, reset.

Usage:
    # Basic usage with explicit keys
    class MyRegistry(SimpleRegistry[str, MyItem]):
        pass

    registry = MyRegistry()
    registry.register("item1", MyItem(...))
    item = registry.get("item1")

    # With key extraction from items
    class ProviderRegistry(SimpleRegistry[str, Provider]):
        def _get_item_key(self, item: Provider) -> str:
            return item.provider_id

    registry = ProviderRegistry()
    registry.register_item(provider)  # Key extracted automatically

    # With duplicate checking
    registry = MyRegistry(allow_overwrite=False)
    registry.register("key", item1)
    registry.register("key", item2)  # Raises DuplicateKeyError

    # With reset and defaults
    class ConfigRegistry(SimpleRegistry[str, Config]):
        def _seed_defaults(self):
            self.register("default", DefaultConfig())

    registry = ConfigRegistry(seed_on_init=True)
    registry.reset()  # Clears and re-seeds defaults
"""

from __future__ import annotations

from typing import (
    Callable,
    Dict,
    Generic,
    Iterator,
    List,
    Optional,
    TypeVar,
    Union,
)
from abc import ABC
import structlog

logger = structlog.get_logger(__name__)

K = TypeVar("K")  # Key type
V = TypeVar("V")  # Value type


class DuplicateKeyError(ValueError):
    """Raised when attempting to register a duplicate key."""

    def __init__(self, key: str, registry_name: str = "registry"):
        self.key = key
        self.registry_name = registry_name
        super().__init__(f"Duplicate key '{key}' in {registry_name}")


class KeyNotFoundError(KeyError):
    """Raised when a key is not found in the registry."""

    def __init__(self, key: str, registry_name: str = "registry"):
        self.key = key
        self.registry_name = registry_name
        super().__init__(f"Key '{key}' not found in {registry_name}")


class SimpleRegistry(Generic[K, V]):
    """
    Generic registry for storing items by key.

    Features:
    - Type-safe key and value types
    - Optional duplicate key prevention
    - Optional reset with default seeding
    - Iteration support
    - Logging of operations

    Args:
        name: Registry name for logging/errors. Defaults to class name.
        allow_overwrite: If False, raise DuplicateKeyError on duplicate keys.
        seed_on_init: If True, call _seed_defaults() on initialization.
        log_operations: If True, log register/unregister operations.
    """

    def __init__(
        self,
        name: Optional[str] = None,
        allow_overwrite: bool = True,
        seed_on_init: bool = False,
        log_operations: bool = True,
    ):
        self._name = name or self.__class__.__name__
        self._allow_overwrite = allow_overwrite
        self._log_operations = log_operations
        self._items: Dict[K, V] = {}

        if seed_on_init:
            self._seed_defaults()

    @property
    def name(self) -> str:
        """Registry name for logging/errors."""
        return self._name

    # =========================================================================
    # Core Operations
    # =========================================================================

    def register(self, key: K, item: V) -> None:
        """
        Register an item with explicit key.

        Args:
            key: The key to register under.
            item: The item to register.

        Raises:
            DuplicateKeyError: If key exists and allow_overwrite=False.
        """
        if not self._allow_overwrite and key in self._items:
            raise DuplicateKeyError(str(key), self._name)

        self._items[key] = item

        if self._log_operations:
            logger.debug(f"Registered item in {self._name}", key=str(key))

    def register_item(self, item: V) -> K:
        """
        Register an item, extracting key automatically.

        Override _get_item_key() to define key extraction logic.

        Args:
            item: The item to register.

        Returns:
            The extracted key.

        Raises:
            NotImplementedError: If _get_item_key() not overridden.
            DuplicateKeyError: If key exists and allow_overwrite=False.
        """
        key = self._get_item_key(item)
        self.register(key, item)
        return key

    def get(self, key: K) -> V:
        """
        Get an item by key.

        Args:
            key: The key to look up.

        Returns:
            The registered item.

        Raises:
            KeyNotFoundError: If key not found.
        """
        if key not in self._items:
            raise KeyNotFoundError(str(key), self._name)
        return self._items[key]

    def get_or_none(self, key: K) -> Optional[V]:
        """Get an item by key, or None if not found."""
        return self._items.get(key)

    def has(self, key: K) -> bool:
        """Check if a key is registered."""
        return key in self._items

    def unregister(self, key: K) -> Optional[V]:
        """
        Unregister an item by key.

        Args:
            key: The key to remove.

        Returns:
            The removed item, or None if key not found.
        """
        item = self._items.pop(key, None)

        if item is not None and self._log_operations:
            logger.debug(f"Unregistered item from {self._name}", key=str(key))

        return item

    def clear(self) -> None:
        """Remove all items from the registry."""
        count = len(self._items)
        self._items.clear()

        if self._log_operations and count > 0:
            logger.debug(f"Cleared {count} items from {self._name}")

    def reset(self) -> None:
        """
        Clear the registry and re-seed defaults.

        Calls:
        1. _on_reset() - for subclass cleanup (e.g., reset registration flags)
        2. clear() - remove all items
        3. _seed_defaults() - re-seed default items

        Override _on_reset() to reset external state like registration flags.
        Override _seed_defaults() to define what gets seeded on reset.
        """
        self._on_reset()
        self.clear()
        self._seed_defaults()

        if self._log_operations:
            logger.debug(f"Reset {self._name} with {len(self._items)} defaults")

    # =========================================================================
    # Query Operations
    # =========================================================================

    def keys(self) -> List[K]:
        """Get all registered keys."""
        return list(self._items.keys())

    def values(self) -> List[V]:
        """Get all registered items."""
        return list(self._items.values())

    def items(self) -> List[tuple[K, V]]:
        """Get all key-value pairs."""
        return list(self._items.items())

    def __len__(self) -> int:
        """Get number of registered items."""
        return len(self._items)

    def __contains__(self, key: K) -> bool:
        """Check if key is registered (supports 'in' operator)."""
        return key in self._items

    def __iter__(self) -> Iterator[K]:
        """Iterate over keys."""
        return iter(self._items)

    # =========================================================================
    # Extension Points
    # =========================================================================

    def _get_item_key(self, item: V) -> K:
        """
        Extract key from an item for register_item().

        Override this to enable register_item() with auto key extraction.

        Args:
            item: The item to extract key from.

        Returns:
            The key for this item.

        Raises:
            NotImplementedError: Must be overridden to use register_item().
        """
        raise NotImplementedError(
            f"{self._name}._get_item_key() must be overridden to use register_item()"
        )

    def _seed_defaults(self) -> None:
        """
        Seed default items on init/reset.

        Override this to define default items that should be registered
        when the registry is initialized or reset.
        """
        pass

    def _on_reset(self) -> None:
        """
        Called at the start of reset() before clearing.

        Override this to reset external state like registration flags
        that need to be cleared when the registry is reset.

        Example:
            def _on_reset(self) -> None:
                from .core_package import reset_core_registration
                reset_core_registration()
        """
        pass


# =============================================================================
# Convenience Functions
# =============================================================================


def create_registry(
    name: str,
    get_key: Optional[Callable[[V], K]] = None,
    allow_overwrite: bool = True,
) -> SimpleRegistry[K, V]:
    """
    Create a simple registry instance with optional key extraction.

    Args:
        name: Registry name for logging/errors.
        get_key: Optional function to extract key from item.
        allow_overwrite: If False, raise on duplicate keys.

    Returns:
        Configured SimpleRegistry instance.

    Example:
        registry = create_registry(
            "providers",
            get_key=lambda p: p.provider_id,
        )
        registry.register_item(my_provider)
    """
    if get_key:
        # Create subclass with custom key extraction
        class CustomRegistry(SimpleRegistry[K, V]):
            def _get_item_key(self, item: V) -> K:
                return get_key(item)

        return CustomRegistry(name=name, allow_overwrite=allow_overwrite)

    return SimpleRegistry(name=name, allow_overwrite=allow_overwrite)
