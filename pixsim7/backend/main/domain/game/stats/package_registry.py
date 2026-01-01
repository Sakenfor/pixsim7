"""
Stat Package Registry

Provides a plugin-extensible registry for stat packages. A stat package
is a reusable bundle of StatDefinition objects (e.g. relationships,
combat, economy) plus light metadata that tools and worlds can
discover and install.

Uses SimpleRegistry for basic registry operations and WorldMergeMixin
for merging package definitions with world overrides.

This module is intentionally world-agnostic: it does not depend on
GameWorld or GameSession. Worlds/projects can choose which packages
and definitions to use via GameWorld.meta.stats_config or other
configuration layers.

Derivation Capabilities:
    Packages can declare derivation_capabilities to automatically derive
    stats from other packages using semantic types. For example, the mood
    package can declare it derives from "positive_sentiment" - at runtime,
    if another package (like relationships) provides axes with that semantic
    type, the derivation happens automatically without hardcoding.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Tuple, Optional, Set
from pydantic import BaseModel, Field
import logging

from pixsim7.backend.main.lib.registry import SimpleRegistry, WorldMergeMixin, merge_by_id
from .schemas import StatDefinition
from .derivation_schemas import DerivationCapability

logger = logging.getLogger(__name__)


class StatPackage(BaseModel):
    """
    Metadata and definitions for a stat package.

    Examples:
        - id="core.relationships" with definitions["relationships"]
        - id="core.attributes" with definitions["attributes"]
        - id="plugin.game-romance.relationships" with plugin-provided variants

    Derivation Support:
        Packages can declare derivation_capabilities to enable automatic
        derivation from semantic types provided by other packages.

        Example:
            StatPackage(
                id="core.mood",
                definitions={"mood": mood_definition},
                derivation_capabilities=[
                    DerivationCapability(
                        id="mood_from_social",
                        from_semantic_types=["positive_sentiment", "arousal_source"],
                        to_stat_definition="mood",
                        formulas=[...],
                    )
                ],
            )
    """

    id: str = Field(description="Unique package ID (e.g. 'core.relationships')")
    label: str = Field(description="Human-readable name for UIs")
    description: Optional[str] = Field(default=None, description="Optional longer description")
    category: Optional[str] = Field(
        default=None,
        description="Optional category (e.g. 'social', 'combat', 'economy')"
    )
    definitions: Dict[str, StatDefinition] = Field(
        default_factory=dict,
        description="Map of stat_definition_id -> StatDefinition"
    )
    source_plugin_id: Optional[str] = Field(
        default=None,
        description="Plugin ID that registered this package, or None for built-in"
    )

    # Derivation capabilities
    derivation_capabilities: List[DerivationCapability] = Field(
        default_factory=list,
        description="Derivations this package can compute from semantic types"
    )

    def get_provided_semantic_types(self) -> Set[str]:
        """Get all semantic types provided by axes in this package's definitions."""
        types: Set[str] = set()
        for definition in self.definitions.values():
            for axis in definition.axes:
                if axis.semantic_type:
                    types.add(axis.semantic_type)
        return types

    def get_derivations_for_available_types(
        self, available_semantic_types: Set[str]
    ) -> List[DerivationCapability]:
        """
        Get derivation capabilities that can run given available semantic types.

        Args:
            available_semantic_types: Set of semantic types available from all packages

        Returns:
            List of derivation capabilities whose required from_semantic_types
            are all satisfied by available_semantic_types
        """
        applicable = []
        for cap in self.derivation_capabilities:
            required = set(cap.from_semantic_types)
            if required.issubset(available_semantic_types):
                applicable.append(cap)
        return applicable


class StatPackageRegistry(SimpleRegistry[str, StatPackage], WorldMergeMixin[StatPackage, StatDefinition]):
    """
    Registry for stat packages with world config merging support.

    Extends SimpleRegistry for basic operations and WorldMergeMixin
    for merging package definitions with world overrides.
    """

    # WorldMergeMixin config
    meta_key = "stats_config"
    items_key = "definitions"

    def __init__(self) -> None:
        super().__init__(name="StatPackageRegistry", log_operations=False)

    def _get_item_key(self, item: StatPackage) -> str:
        return item.id

    def register_package(self, pkg: StatPackage) -> None:
        """Register or overwrite a stat package."""
        existing = self._items.get(pkg.id)
        if existing:
            logger.warning(
                "Overwriting existing stat package",
                extra={
                    "package_id": pkg.id,
                    "old_plugin": existing.source_plugin_id,
                    "new_plugin": pkg.source_plugin_id,
                },
            )
        self._items[pkg.id] = pkg
        logger.info(
            "Registered stat package",
            extra={
                "package_id": pkg.id,
                "definitions": list(pkg.definitions.keys()),
                "source_plugin_id": pkg.source_plugin_id,
            },
        )

    # =========================================================================
    # WorldMergeMixin Implementation
    # =========================================================================

    def _get_packages(self) -> Iterable[StatPackage]:
        """Return all registered packages."""
        return self._items.values()

    def _collect_base_items(self, package: StatPackage) -> Dict[str, StatDefinition]:
        """Extract definitions from a package."""
        return package.definitions

    def _merge_item(self, base: StatDefinition, override: Dict) -> StatDefinition:
        """Merge an override dict into a base definition."""
        return _merge_definition(base, override)

    def _create_item(self, item_id: str, data: Dict) -> Optional[StatDefinition]:
        """Create a new StatDefinition from raw dict."""
        try:
            return StatDefinition.model_validate(data)
        except Exception:
            return None

    # =========================================================================
    # Query Methods
    # =========================================================================

    def find_stat_definitions(
        self, stat_definition_id: str
    ) -> List[Tuple[StatPackage, StatDefinition]]:
        """
        Find all StatDefinition instances with the given ID across all packages.

        Returns a list of (StatPackage, StatDefinition) pairs.
        """
        results: List[Tuple[StatPackage, StatDefinition]] = []
        for pkg in self._items.values():
            if stat_definition_id in pkg.definitions:
                results.append((pkg, pkg.definitions[stat_definition_id]))
        return results

    def get_all_semantic_types(
        self, package_ids: Optional[List[str]] = None
    ) -> Set[str]:
        """Get all semantic types provided by registered packages."""
        types: Set[str] = set()
        packages = (
            self._items.values()
            if package_ids is None
            else [self._items[pid] for pid in package_ids if pid in self._items]
        )
        for pkg in packages:
            types.update(pkg.get_provided_semantic_types())
        return types

    def find_axes_by_semantic_type(
        self,
        semantic_type: str,
        package_ids: Optional[List[str]] = None,
    ) -> List[Tuple[StatPackage, StatDefinition, "StatAxis"]]:
        """Find all axes with a given semantic type across packages."""
        from .schemas import StatAxis

        results: List[Tuple[StatPackage, StatDefinition, StatAxis]] = []
        packages = (
            self._items.values()
            if package_ids is None
            else [self._items[pid] for pid in package_ids if pid in self._items]
        )

        for pkg in packages:
            for definition in pkg.definitions.values():
                for axis in definition.axes:
                    if axis.semantic_type == semantic_type:
                        results.append((pkg, definition, axis))

        return results

    def get_applicable_derivations(
        self,
        package_ids: List[str],
        excluded_derivation_ids: Optional[Set[str]] = None,
    ) -> List[Tuple[StatPackage, DerivationCapability]]:
        """Get all derivation capabilities that can run given the available packages."""
        excluded = excluded_derivation_ids or set()

        # Gather all available semantic types from active packages
        available_types = self.get_all_semantic_types(package_ids)

        # Find all derivations that can run
        applicable: List[Tuple[StatPackage, DerivationCapability]] = []
        for pid in package_ids:
            pkg = self._items.get(pid)
            if not pkg:
                continue

            for cap in pkg.get_derivations_for_available_types(available_types):
                if cap.id not in excluded and cap.enabled_by_default:
                    applicable.append((pkg, cap))

        # Sort by priority (lower = runs first)
        applicable.sort(key=lambda x: x[1].priority)

        return applicable


# Singleton instance
_registry = StatPackageRegistry()


# =============================================================================
# Public API Functions (backwards compatible)
# =============================================================================


def register_stat_package(pkg: StatPackage) -> None:
    """Register or overwrite a stat package."""
    _registry.register_package(pkg)


def get_stat_package(package_id: str) -> Optional[StatPackage]:
    """Get a stat package by ID, or None if not registered."""
    return _registry.get_or_none(package_id)


def list_stat_packages() -> Dict[str, StatPackage]:
    """Return a snapshot of all registered stat packages."""
    return dict(_registry._items)


def find_stat_definitions(
    stat_definition_id: str,
) -> List[Tuple[StatPackage, StatDefinition]]:
    """Find all StatDefinition instances with the given ID across all packages."""
    return _registry.find_stat_definitions(stat_definition_id)


def get_all_semantic_types(package_ids: Optional[List[str]] = None) -> Set[str]:
    """Get all semantic types provided by registered packages."""
    return _registry.get_all_semantic_types(package_ids)


def find_axes_by_semantic_type(
    semantic_type: str,
    package_ids: Optional[List[str]] = None,
) -> List[Tuple[StatPackage, StatDefinition, "StatAxis"]]:
    """Find all axes with a given semantic type across packages."""
    return _registry.find_axes_by_semantic_type(semantic_type, package_ids)


def get_applicable_derivations(
    package_ids: List[str],
    excluded_derivation_ids: Optional[Set[str]] = None,
) -> List[Tuple[StatPackage, DerivationCapability]]:
    """Get all derivation capabilities that can run given the available packages."""
    return _registry.get_applicable_derivations(package_ids, excluded_derivation_ids)


# =============================================================================
# World Config Builder
# =============================================================================


def get_merged_stats_config(world_meta: Optional[Dict] = None) -> "WorldStatsConfig":
    """
    Get stats config merged with world overrides.

    Uses WorldMergeMixin to merge package definitions with world overrides.
    """
    from .schemas import WorldStatsConfig

    result = _registry.get_merged_items(world_meta)
    return WorldStatsConfig(version=1, definitions=result.items)


def _merge_definition(base: "StatDefinition", override: Dict) -> "StatDefinition":
    """
    Merge an override dict into a base definition.

    Uses shared merge_by_id utility for tiers and levels.
    """
    from .schemas import StatTier, StatLevel

    merged = base.model_copy(deep=True)

    # Merge simple fields
    if "display_name" in override:
        merged.display_name = override["display_name"]
    if "description" in override:
        merged.description = override["description"]

    # Merge tiers (add/replace by ID) using shared utility
    if "tiers" in override:
        base_tiers = [t.model_dump() for t in merged.tiers]
        merged_tier_dicts, _, _ = merge_by_id(base_tiers, override["tiers"], id_field="id")
        merged.tiers = []
        for tier_data in merged_tier_dicts:
            try:
                merged.tiers.append(StatTier.model_validate(tier_data))
            except Exception:
                pass

    # Merge levels (add/replace by ID) using shared utility
    if "levels" in override:
        base_levels = [lvl.model_dump() for lvl in merged.levels]
        merged_level_dicts, _, _ = merge_by_id(base_levels, override["levels"], id_field="id")
        merged.levels = []
        for level_data in merged_level_dicts:
            try:
                merged.levels.append(StatLevel.model_validate(level_data))
            except Exception:
                pass

    return merged


def get_world_config(world_meta: Optional[Dict] = None) -> "WorldConfigResponse":
    """
    Get complete world configuration.

    Merges registered definitions with world overrides and returns
    a complete config response with pre-computed ordering.

    Args:
        world_meta: The world's meta dict (optional)

    Returns:
        WorldConfigResponse with all config and pre-computed orders
    """
    from .schemas import (
        WorldConfigResponse,
        WorldManifest,
        IntimacyGatingConfig,
        STATS_SCHEMA_VERSION,
    )

    meta = world_meta or {}

    # Get merged stats config
    stats_config = get_merged_stats_config(meta)

    # Parse manifest
    manifest_data = meta.get("manifest", {})
    try:
        manifest = WorldManifest.model_validate(manifest_data)
    except Exception:
        manifest = WorldManifest()

    # Parse intimacy gating
    gating_data = meta.get("intimacy_gating", {})
    try:
        intimacy_gating = IntimacyGatingConfig.model_validate(gating_data)
    except Exception:
        intimacy_gating = IntimacyGatingConfig()

    # Pre-compute ordering for relationships (primary stat definition)
    tier_order = stats_config.get_tier_order("relationships")
    level_order = stats_config.get_level_order("relationships")

    return WorldConfigResponse(
        schema_version=STATS_SCHEMA_VERSION,
        stats_config=stats_config,
        manifest=manifest,
        intimacy_gating=intimacy_gating,
        tier_order=tier_order,
        level_order=level_order,
    )

