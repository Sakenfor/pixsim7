"""
World Merge Utilities

Provides utilities for merging package-defined configurations with world-specific
overrides from world.meta. Used by Stats and Composition registries.

Merge Pattern:
1. Collect base definitions from registered packages
2. Apply world-specific overrides from world.meta[config_key]
3. Later packages/overrides win on conflicts

Merge Strategies:
- REPLACE: Override value completely replaces base
- MERGE_BY_ID: Merge lists by item ID (e.g., tiers, levels)
- DEEP_MERGE: Recursively merge nested dicts

Usage:
    from pixsim7.backend.main.lib.registry import WorldMergeMixin

    class MyPackageRegistry(WorldMergeMixin[MyPackage, MyConfig]):
        meta_key = "my_config"  # Key in world.meta

        def _get_packages(self) -> Iterable[MyPackage]:
            return _packages.values()

        def _collect_base_items(self, package: MyPackage) -> dict[str, Item]:
            return package.definitions

        def _merge_item(self, base: Item, override: dict) -> Item:
            # Custom merge logic
            return merged

    registry = MyPackageRegistry()
    config = registry.get_merged_config(world_meta)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from copy import deepcopy
from dataclasses import dataclass, field
from enum import Enum
from typing import (
    Any,
    Callable,
    Dict,
    Generic,
    Iterable,
    List,
    Optional,
    TypeVar,
    Union,
)
import structlog

logger = structlog.get_logger(__name__)

P = TypeVar("P")  # Package type
T = TypeVar("T")  # Item/definition type


class MergeStrategy(Enum):
    """Strategies for merging values."""

    REPLACE = "replace"
    """Override value completely replaces base."""

    MERGE_BY_ID = "merge_by_id"
    """Merge lists by item ID (assumes items have 'id' field)."""

    DEEP_MERGE = "deep_merge"
    """Recursively merge nested dicts."""


@dataclass
class MergeResult(Generic[T]):
    """Result of a merge operation."""

    items: Dict[str, T]
    """Merged items by ID."""

    overridden_ids: List[str] = field(default_factory=list)
    """IDs that were overridden from world.meta."""

    added_ids: List[str] = field(default_factory=list)
    """IDs that were added from world.meta (not in base)."""

    errors: List[str] = field(default_factory=list)
    """Any errors encountered during merge."""


def deep_merge_dicts(base: Dict, override: Dict) -> Dict:
    """
    Deep merge two dicts, with override taking precedence.

    - For nested dicts: recursively merge
    - For lists: override replaces (no merge)
    - For other values: override replaces

    Args:
        base: Base dictionary
        override: Override dictionary

    Returns:
        New merged dictionary
    """
    result = deepcopy(base)

    for key, override_value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(override_value, dict):
            # Recursively merge nested dicts
            result[key] = deep_merge_dicts(result[key], override_value)
        else:
            # Replace value
            result[key] = deepcopy(override_value)

    return result


def merge_by_id(
    base_items: List[Dict],
    override_items: List[Dict],
    id_field: str = "id",
) -> tuple[List[Dict], List[str], List[str]]:
    """
    Merge two lists of items by ID field.

    Items in override with matching IDs replace base items.
    Items in override with new IDs are added.

    Args:
        base_items: Base list of items (dicts with id_field)
        override_items: Override items to merge in
        id_field: Name of the ID field

    Returns:
        Tuple of (merged_items, overridden_ids, added_ids)
    """
    # Build map from base
    item_map = {item.get(id_field): deepcopy(item) for item in base_items if id_field in item}

    overridden_ids = []
    added_ids = []

    for override_item in override_items:
        item_id = override_item.get(id_field)
        if not item_id:
            continue

        if item_id in item_map:
            overridden_ids.append(item_id)
        else:
            added_ids.append(item_id)

        item_map[item_id] = deepcopy(override_item)

    return list(item_map.values()), overridden_ids, added_ids


class WorldMergeMixin(Generic[P, T], ABC):
    """
    Mixin for registries that support world-level config merging.

    Provides a standard pattern for:
    1. Collecting definitions from registered packages
    2. Applying world-specific overrides
    3. Producing a merged configuration

    Type Parameters:
        P: Package type (e.g., StatPackage)
        T: Item/definition type (e.g., StatDefinition)

    Required Methods:
        _get_packages(): Return iterable of registered packages
        _collect_base_items(package): Extract items from a package

    Optional Methods:
        _merge_item(base, override): Custom item merge logic
        _validate_override(override): Validate override before merging
        _create_item(data): Create item from raw dict (for new items)
    """

    # Override in subclass: key in world.meta to look for overrides
    meta_key: str = "config"

    # Override in subclass: key within meta_key that contains items
    items_key: str = "definitions"

    @abstractmethod
    def _get_packages(self) -> Iterable[P]:
        """Return all registered packages."""
        ...

    @abstractmethod
    def _collect_base_items(self, package: P) -> Dict[str, T]:
        """Extract items from a package. Returns dict of id -> item."""
        ...

    def _merge_item(self, base: T, override: Dict) -> T:
        """
        Merge an override dict into a base item.

        Default: deep copy base and update with override dict.
        Override this for custom merge logic.

        Args:
            base: Base item
            override: Override dict from world.meta

        Returns:
            Merged item
        """
        # Default: try to update base with override
        merged = deepcopy(base)

        # If base has dict-like update, use it
        if hasattr(merged, "model_copy"):
            # Pydantic model - use model_copy with update
            return merged.model_copy(update=override, deep=True)
        elif hasattr(merged, "__dict__"):
            # Regular object - update __dict__
            for key, value in override.items():
                if hasattr(merged, key):
                    setattr(merged, key, deepcopy(value))
            return merged
        else:
            # Can't merge - just return base
            return merged

    def _validate_override(self, item_id: str, override: Dict) -> Optional[str]:
        """
        Validate an override before merging.

        Returns error message if invalid, None if valid.
        Override this to add custom validation.
        """
        return None

    def _create_item(self, item_id: str, data: Dict) -> Optional[T]:
        """
        Create a new item from raw dict (for items in override but not in base).

        Returns None to skip creating new items.
        Override this to support creating new items from world overrides.
        """
        return None

    def get_merged_items(
        self,
        world_meta: Optional[Dict] = None,
    ) -> MergeResult[T]:
        """
        Get items merged with world overrides.

        Args:
            world_meta: World's meta dict (optional)

        Returns:
            MergeResult with merged items and merge info
        """
        errors: List[str] = []
        overridden_ids: List[str] = []
        added_ids: List[str] = []

        # Collect base items from all packages
        merged_items: Dict[str, T] = {}
        for package in self._get_packages():
            for item_id, item in self._collect_base_items(package).items():
                # Later packages override earlier ones
                merged_items[item_id] = deepcopy(item) if hasattr(item, "__dict__") else item

        # Apply world overrides if present
        if world_meta:
            meta_section = world_meta.get(self.meta_key, {})
            overrides = meta_section.get(self.items_key, {})

            for item_id, override in overrides.items():
                if not isinstance(override, dict):
                    errors.append(f"Override for '{item_id}' is not a dict")
                    continue

                # Validate override
                error = self._validate_override(item_id, override)
                if error:
                    errors.append(f"Invalid override for '{item_id}': {error}")
                    continue

                if item_id in merged_items:
                    # Merge into existing
                    try:
                        merged_items[item_id] = self._merge_item(
                            merged_items[item_id], override
                        )
                        overridden_ids.append(item_id)
                    except Exception as e:
                        errors.append(f"Failed to merge '{item_id}': {e}")
                else:
                    # Try to create new item
                    try:
                        new_item = self._create_item(item_id, override)
                        if new_item is not None:
                            merged_items[item_id] = new_item
                            added_ids.append(item_id)
                    except Exception as e:
                        errors.append(f"Failed to create '{item_id}': {e}")

        return MergeResult(
            items=merged_items,
            overridden_ids=overridden_ids,
            added_ids=added_ids,
            errors=errors,
        )

    def get_meta_section(
        self,
        world_meta: Optional[Dict],
        section_key: str,
        default: Optional[T] = None,
    ) -> Optional[T]:
        """
        Get a section from world.meta with optional default.

        Convenience method for parsing additional world.meta sections.

        Args:
            world_meta: World's meta dict
            section_key: Key to look up in world.meta
            default: Default value if not found

        Returns:
            The section value or default
        """
        if not world_meta:
            return default
        return world_meta.get(section_key, default)
