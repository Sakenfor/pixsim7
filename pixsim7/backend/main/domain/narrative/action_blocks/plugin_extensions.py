"""
Plugin Extension Points for Action Block Selection.

This module provides registration APIs for plugins to extend action block
filtering and scoring logic without modifying core code.

Usage:
    from pixsim7.backend.main.domain.narrative.action_blocks.plugin_extensions import (
        register_block_filter,
        register_block_scorer,
        get_plugin_extensions,
    )

    # Register a custom filter
    class MyFilter(BlockFilter):
        def filter(self, block, context):
            return block.get_tag_extension("my_plugin", "enabled", True)

    register_block_filter(MyFilter(), plugin_id="my_plugin")

    # Register a custom scorer
    class MyScorer(BlockScorer):
        def score(self, block, context):
            return 1.0 if block.tags.mood == "mood:mysterious" else 0.5

    register_block_scorer(MyScorer(weight=0.1), plugin_id="my_plugin")
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any, Type
from abc import ABC, abstractmethod

import pixsim_logging

from .types_unified import ActionBlock, ActionSelectionContext
from .filters import BlockFilter, CompositeFilter
from .scorers import BlockScorer, CompositeScorer

logger = pixsim_logging.get_logger()


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class RegisteredFilter:
    """Metadata about a registered plugin filter."""
    filter: BlockFilter
    plugin_id: str
    priority: int = 0  # Higher priority = runs first
    enabled: bool = True


@dataclass
class RegisteredScorer:
    """Metadata about a registered plugin scorer."""
    scorer: BlockScorer
    plugin_id: str
    priority: int = 0  # Higher priority = runs first
    enabled: bool = True


@dataclass
class ExtensionValidator:
    """Validator for plugin extension data."""
    plugin_id: str
    namespace: str
    validator: Callable[[Any], bool]
    description: str = ""


# =============================================================================
# PLUGIN EXTENSION REGISTRY
# =============================================================================

class PluginExtensionRegistry:
    """
    Central registry for plugin-provided filters, scorers, and validators.

    This registry is a singleton that collects all plugin extensions and
    provides them to the selector at runtime.
    """

    def __init__(self):
        self._filters: Dict[str, RegisteredFilter] = {}
        self._scorers: Dict[str, RegisteredScorer] = {}
        self._validators: Dict[str, ExtensionValidator] = {}
        self._scoring_weight_overrides: Dict[str, Dict[str, float]] = {}

    # =========================================================================
    # Filter Registration
    # =========================================================================

    def register_filter(
        self,
        filter: BlockFilter,
        *,
        plugin_id: str,
        priority: int = 0,
        filter_id: Optional[str] = None,
    ) -> str:
        """
        Register a plugin-provided filter.

        Args:
            filter: The BlockFilter instance
            plugin_id: Unique plugin identifier
            priority: Execution priority (higher = runs first)
            filter_id: Optional unique ID for this filter. Defaults to class name.

        Returns:
            The filter ID used for registration

        Raises:
            ValueError: If filter_id already registered by different plugin
        """
        fid = filter_id or f"{plugin_id}.{filter.__class__.__name__}"

        if fid in self._filters:
            existing = self._filters[fid]
            if existing.plugin_id != plugin_id:
                raise ValueError(
                    f"Filter '{fid}' already registered by plugin '{existing.plugin_id}'"
                )

        self._filters[fid] = RegisteredFilter(
            filter=filter,
            plugin_id=plugin_id,
            priority=priority,
        )

        logger.info(
            "plugin_filter_registered",
            filter_id=fid,
            plugin_id=plugin_id,
            priority=priority,
        )

        return fid

    def unregister_filter(self, filter_id: str) -> bool:
        """
        Unregister a filter by ID.

        Returns:
            True if filter was found and removed
        """
        if filter_id in self._filters:
            del self._filters[filter_id]
            logger.info("plugin_filter_unregistered", filter_id=filter_id)
            return True
        return False

    def get_plugin_filters(
        self,
        enabled_only: bool = True,
    ) -> List[BlockFilter]:
        """
        Get all registered plugin filters in priority order.

        Args:
            enabled_only: Only return enabled filters

        Returns:
            List of BlockFilter instances sorted by priority (highest first)
        """
        registered = [
            rf for rf in self._filters.values()
            if not enabled_only or rf.enabled
        ]
        registered.sort(key=lambda rf: rf.priority, reverse=True)
        return [rf.filter for rf in registered]

    def get_filters_for_plugin(self, plugin_id: str) -> List[RegisteredFilter]:
        """Get all filters registered by a specific plugin."""
        return [rf for rf in self._filters.values() if rf.plugin_id == plugin_id]

    # =========================================================================
    # Scorer Registration
    # =========================================================================

    def register_scorer(
        self,
        scorer: BlockScorer,
        *,
        plugin_id: str,
        priority: int = 0,
        scorer_id: Optional[str] = None,
    ) -> str:
        """
        Register a plugin-provided scorer.

        Args:
            scorer: The BlockScorer instance
            plugin_id: Unique plugin identifier
            priority: Execution priority (higher = runs first)
            scorer_id: Optional unique ID for this scorer. Defaults to class name.

        Returns:
            The scorer ID used for registration

        Raises:
            ValueError: If scorer_id already registered by different plugin
        """
        sid = scorer_id or f"{plugin_id}.{scorer.__class__.__name__}"

        if sid in self._scorers:
            existing = self._scorers[sid]
            if existing.plugin_id != plugin_id:
                raise ValueError(
                    f"Scorer '{sid}' already registered by plugin '{existing.plugin_id}'"
                )

        self._scorers[sid] = RegisteredScorer(
            scorer=scorer,
            plugin_id=plugin_id,
            priority=priority,
        )

        logger.info(
            "plugin_scorer_registered",
            scorer_id=sid,
            plugin_id=plugin_id,
            priority=priority,
            weight=scorer.weight,
        )

        return sid

    def unregister_scorer(self, scorer_id: str) -> bool:
        """
        Unregister a scorer by ID.

        Returns:
            True if scorer was found and removed
        """
        if scorer_id in self._scorers:
            del self._scorers[scorer_id]
            logger.info("plugin_scorer_unregistered", scorer_id=scorer_id)
            return True
        return False

    def get_plugin_scorers(
        self,
        enabled_only: bool = True,
    ) -> List[BlockScorer]:
        """
        Get all registered plugin scorers in priority order.

        Args:
            enabled_only: Only return enabled scorers

        Returns:
            List of BlockScorer instances sorted by priority (highest first)
        """
        registered = [
            rs for rs in self._scorers.values()
            if not enabled_only or rs.enabled
        ]
        registered.sort(key=lambda rs: rs.priority, reverse=True)
        return [rs.scorer for rs in registered]

    def get_scorers_for_plugin(self, plugin_id: str) -> List[RegisteredScorer]:
        """Get all scorers registered by a specific plugin."""
        return [rs for rs in self._scorers.values() if rs.plugin_id == plugin_id]

    # =========================================================================
    # Extension Validators
    # =========================================================================

    def register_extension_validator(
        self,
        validator: Callable[[Any], bool],
        *,
        plugin_id: str,
        namespace: str,
        description: str = "",
    ) -> str:
        """
        Register a validator for plugin extension data.

        Args:
            validator: Function that validates extension data
            plugin_id: Unique plugin identifier
            namespace: Extension namespace (e.g., "my_plugin.custom_data")
            description: Human-readable description of valid data

        Returns:
            The validator ID
        """
        vid = f"{plugin_id}.{namespace}"

        self._validators[vid] = ExtensionValidator(
            plugin_id=plugin_id,
            namespace=namespace,
            validator=validator,
            description=description,
        )

        logger.debug(
            "plugin_extension_validator_registered",
            validator_id=vid,
            plugin_id=plugin_id,
        )

        return vid

    def validate_extension(self, namespace: str, value: Any) -> bool:
        """
        Validate extension data against registered validator.

        Args:
            namespace: Extension namespace
            value: Value to validate

        Returns:
            True if valid or no validator registered
        """
        validator_info = self._validators.get(namespace)
        if validator_info is None:
            return True  # No validator = always valid

        return validator_info.validator(value)

    # =========================================================================
    # Scoring Weight Overrides
    # =========================================================================

    def register_scoring_weights(
        self,
        weights: Dict[str, float],
        *,
        plugin_id: str,
    ) -> None:
        """
        Register scoring weight overrides for a plugin.

        These weights are merged with core weights by the selector.

        Args:
            weights: Dict of weight name -> weight value
            plugin_id: Unique plugin identifier
        """
        self._scoring_weight_overrides[plugin_id] = weights

        logger.info(
            "plugin_scoring_weights_registered",
            plugin_id=plugin_id,
            weights=list(weights.keys()),
        )

    def get_all_scoring_weight_overrides(self) -> Dict[str, Dict[str, float]]:
        """Get all registered scoring weight overrides."""
        return self._scoring_weight_overrides.copy()

    # =========================================================================
    # Utility
    # =========================================================================

    def enable_filter(self, filter_id: str, enabled: bool = True) -> bool:
        """Enable or disable a filter."""
        if filter_id in self._filters:
            self._filters[filter_id].enabled = enabled
            return True
        return False

    def enable_scorer(self, scorer_id: str, enabled: bool = True) -> bool:
        """Enable or disable a scorer."""
        if scorer_id in self._scorers:
            self._scorers[scorer_id].enabled = enabled
            return True
        return False

    def enable_plugin(self, plugin_id: str, enabled: bool = True) -> None:
        """Enable or disable all extensions from a plugin."""
        for rf in self._filters.values():
            if rf.plugin_id == plugin_id:
                rf.enabled = enabled
        for rs in self._scorers.values():
            if rs.plugin_id == plugin_id:
                rs.enabled = enabled

    def clear_plugin(self, plugin_id: str) -> None:
        """Remove all extensions registered by a plugin."""
        self._filters = {
            k: v for k, v in self._filters.items()
            if v.plugin_id != plugin_id
        }
        self._scorers = {
            k: v for k, v in self._scorers.items()
            if v.plugin_id != plugin_id
        }
        self._validators = {
            k: v for k, v in self._validators.items()
            if v.plugin_id != plugin_id
        }
        self._scoring_weight_overrides.pop(plugin_id, None)

        logger.info("plugin_extensions_cleared", plugin_id=plugin_id)

    def clear_all(self) -> None:
        """Clear all registered extensions."""
        self._filters.clear()
        self._scorers.clear()
        self._validators.clear()
        self._scoring_weight_overrides.clear()

    def stats(self) -> Dict[str, int]:
        """Get extension counts."""
        return {
            "filters": len(self._filters),
            "scorers": len(self._scorers),
            "validators": len(self._validators),
            "weight_overrides": len(self._scoring_weight_overrides),
        }


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_registry_instance: Optional[PluginExtensionRegistry] = None


def get_plugin_extensions() -> PluginExtensionRegistry:
    """Get the global plugin extension registry."""
    global _registry_instance
    if _registry_instance is None:
        _registry_instance = PluginExtensionRegistry()
    return _registry_instance


def reset_plugin_extensions() -> None:
    """Reset the global registry. Useful for testing."""
    global _registry_instance
    if _registry_instance:
        _registry_instance.clear_all()
    _registry_instance = None


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def register_block_filter(
    filter: BlockFilter,
    *,
    plugin_id: str,
    priority: int = 0,
    filter_id: Optional[str] = None,
) -> str:
    """
    Register a plugin-provided filter.

    Convenience wrapper around get_plugin_extensions().register_filter().
    """
    return get_plugin_extensions().register_filter(
        filter,
        plugin_id=plugin_id,
        priority=priority,
        filter_id=filter_id,
    )


def register_block_scorer(
    scorer: BlockScorer,
    *,
    plugin_id: str,
    priority: int = 0,
    scorer_id: Optional[str] = None,
) -> str:
    """
    Register a plugin-provided scorer.

    Convenience wrapper around get_plugin_extensions().register_scorer().
    """
    return get_plugin_extensions().register_scorer(
        scorer,
        plugin_id=plugin_id,
        priority=priority,
        scorer_id=scorer_id,
    )


def register_extension_validator(
    validator: Callable[[Any], bool],
    *,
    plugin_id: str,
    namespace: str,
    description: str = "",
) -> str:
    """
    Register a validator for plugin extension data.

    Convenience wrapper around get_plugin_extensions().register_extension_validator().
    """
    return get_plugin_extensions().register_extension_validator(
        validator,
        plugin_id=plugin_id,
        namespace=namespace,
        description=description,
    )


# =============================================================================
# COMPOSITE FACTORY WITH PLUGIN EXTENSIONS
# =============================================================================

def create_filters_with_plugins(
    ontology=None,
    registry=None,
    include_chain_filter: bool = False,
) -> CompositeFilter:
    """
    Create the default filter chain plus plugin-provided filters.

    Args:
        ontology: OntologyService instance
        registry: BlockRegistry for chain compatibility
        include_chain_filter: Whether to include chain compatibility filter

    Returns:
        CompositeFilter with core + plugin filters
    """
    from .filters import create_default_filters

    # Start with core filters
    composite = create_default_filters(
        ontology=ontology,
        registry=registry,
        include_chain_filter=include_chain_filter,
    )

    # Add plugin filters (they run after core filters)
    plugin_filters = get_plugin_extensions().get_plugin_filters()
    for pf in plugin_filters:
        composite.add(pf)

    return composite


def create_scorers_with_plugins(
    config=None,
    registry=None,
    ontology=None,
) -> CompositeScorer:
    """
    Create the default scorer chain plus plugin-provided scorers.

    Args:
        config: ScoringConfig with weights
        registry: BlockRegistry for chain compatibility
        ontology: OntologyService instance

    Returns:
        CompositeScorer with core + plugin scorers
    """
    from .scorers import create_default_scorers

    # Start with core scorers
    composite = create_default_scorers(
        config=config,
        registry=registry,
        ontology=ontology,
    )

    # Add plugin scorers
    plugin_scorers = get_plugin_extensions().get_plugin_scorers()
    for ps in plugin_scorers:
        composite.add(ps)

    return composite


__all__ = [
    # Registry class
    "PluginExtensionRegistry",
    # Data classes
    "RegisteredFilter",
    "RegisteredScorer",
    "ExtensionValidator",
    # Singleton
    "get_plugin_extensions",
    "reset_plugin_extensions",
    # Registration functions
    "register_block_filter",
    "register_block_scorer",
    "register_extension_validator",
    # Factory functions
    "create_filters_with_plugins",
    "create_scorers_with_plugins",
]
