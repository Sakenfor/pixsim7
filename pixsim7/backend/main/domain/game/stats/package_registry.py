"""
Stat Package Registry

Provides a plugin-extensible registry for stat packages. A stat package
is a reusable bundle of StatDefinition objects (e.g. relationships,
combat, economy) plus light metadata that tools and worlds can
discover and install.

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

from typing import Dict, List, Tuple, Optional, Set
from pydantic import BaseModel, Field
import logging

from pixsim7.backend.main.lib.registry import merge_by_id
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


_packages: Dict[str, StatPackage] = {}


def register_stat_package(pkg: StatPackage) -> None:
    """
    Register or overwrite a stat package.

    This can be called by core modules or backend plugins during startup.
    If a package with the same ID already exists, it will be replaced and
    a warning will be logged.
    """
    existing = _packages.get(pkg.id)
    if existing:
        logger.warning(
            "Overwriting existing stat package",
            extra={"package_id": pkg.id, "old_plugin": existing.source_plugin_id, "new_plugin": pkg.source_plugin_id},
        )
    _packages[pkg.id] = pkg
    logger.info(
        "Registered stat package",
        extra={
            "package_id": pkg.id,
            "definitions": list(pkg.definitions.keys()),
            "source_plugin_id": pkg.source_plugin_id,
        },
    )


def get_stat_package(package_id: str) -> Optional[StatPackage]:
    """Get a stat package by ID, or None if not registered."""
    return _packages.get(package_id)


def list_stat_packages() -> Dict[str, StatPackage]:
    """Return a snapshot of all registered stat packages."""
    return dict(_packages)


def find_stat_definitions(stat_definition_id: str) -> List[Tuple[StatPackage, StatDefinition]]:
    """
    Find all StatDefinition instances with the given ID across all packages.

    Returns a list of (StatPackage, StatDefinition) pairs. This can be used
    by tools to discover which packages provide a particular stat definition
    (e.g. multiple plugins providing 'relationships').
    """
    results: List[Tuple[StatPackage, StatDefinition]] = []
    for pkg in _packages.values():
        if stat_definition_id in pkg.definitions:
            results.append((pkg, pkg.definitions[stat_definition_id]))
    return results


def get_all_semantic_types(package_ids: Optional[List[str]] = None) -> Set[str]:
    """
    Get all semantic types provided by registered packages.

    Args:
        package_ids: Optional list of package IDs to check. If None, checks all.

    Returns:
        Set of all semantic types available from the specified packages.
    """
    types: Set[str] = set()
    packages = _packages.values() if package_ids is None else [
        _packages[pid] for pid in package_ids if pid in _packages
    ]
    for pkg in packages:
        types.update(pkg.get_provided_semantic_types())
    return types


def find_axes_by_semantic_type(
    semantic_type: str,
    package_ids: Optional[List[str]] = None
) -> List[Tuple[StatPackage, StatDefinition, "StatAxis"]]:
    """
    Find all axes with a given semantic type across packages.

    Args:
        semantic_type: The semantic type to search for
        package_ids: Optional list of package IDs to search. If None, searches all.

    Returns:
        List of (package, definition, axis) tuples for matching axes
    """
    from .schemas import StatAxis  # Import here to avoid circular

    results: List[Tuple[StatPackage, StatDefinition, StatAxis]] = []
    packages = _packages.values() if package_ids is None else [
        _packages[pid] for pid in package_ids if pid in _packages
    ]

    for pkg in packages:
        for definition in pkg.definitions.values():
            for axis in definition.axes:
                if axis.semantic_type == semantic_type:
                    results.append((pkg, definition, axis))

    return results


def get_applicable_derivations(
    package_ids: List[str],
    excluded_derivation_ids: Optional[Set[str]] = None
) -> List[Tuple[StatPackage, DerivationCapability]]:
    """
    Get all derivation capabilities that can run given the available packages.

    Args:
        package_ids: List of package IDs that are active
        excluded_derivation_ids: Optional set of derivation IDs to exclude

    Returns:
        List of (package, derivation_capability) tuples that can run,
        sorted by priority (lower first)
    """
    excluded = excluded_derivation_ids or set()

    # Gather all available semantic types from active packages
    available_types = get_all_semantic_types(package_ids)

    # Find all derivations that can run
    applicable: List[Tuple[StatPackage, DerivationCapability]] = []
    for pid in package_ids:
        pkg = _packages.get(pid)
        if not pkg:
            continue

        for cap in pkg.get_derivations_for_available_types(available_types):
            if cap.id not in excluded and cap.enabled_by_default:
                applicable.append((pkg, cap))

    # Sort by priority (lower = runs first)
    applicable.sort(key=lambda x: x[1].priority)

    return applicable


# =============================================================================
# World Config Builder
# =============================================================================

def get_merged_stats_config(world_meta: Optional[Dict] = None) -> "WorldStatsConfig":
    """
    Get stats config merged with world overrides.

    Starts with definitions from all registered packages, then merges any
    world-specific overrides from world.meta.stats_config.

    Args:
        world_meta: The world's meta dict (optional)

    Returns:
        WorldStatsConfig with merged definitions
    """
    from .schemas import WorldStatsConfig, StatDefinition, StatTier, StatLevel

    # Collect all definitions from registered packages
    merged_definitions: Dict[str, StatDefinition] = {}
    for pkg in _packages.values():
        for def_id, defn in pkg.definitions.items():
            # If multiple packages provide the same definition, later wins
            merged_definitions[def_id] = defn.model_copy(deep=True)

    # Apply world overrides if present
    if world_meta:
        world_stats = world_meta.get("stats_config", {})
        world_defs = world_stats.get("definitions", {})

        for def_id, override in world_defs.items():
            if def_id in merged_definitions:
                # Merge override into existing definition
                base = merged_definitions[def_id]
                merged_definitions[def_id] = _merge_definition(base, override)
            else:
                # New definition from world (no base)
                try:
                    merged_definitions[def_id] = StatDefinition.model_validate(override)
                except Exception:
                    pass  # Skip invalid definitions

    return WorldStatsConfig(
        version=1,
        definitions=merged_definitions
    )


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

