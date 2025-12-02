"""
Stat computation engine.

Provides generic computation for tiers, levels, and value normalization
across any stat definition.
"""

from typing import Dict, Any, Optional, List
from .schemas import StatDefinition, StatTier, StatLevel, StatAxis


class StatEngine:
    """
    Generic stat computation engine.

    Handles:
    - Value clamping to axis ranges
    - Tier computation for single axes
    - Level computation for multi-axis conditions
    - Normalization (adding computed tierId, levelId to stat data)
    """

    @staticmethod
    def clamp_value(value: float, axis: StatAxis) -> float:
        """
        Clamp a value to the axis's valid range.

        Args:
            value: The value to clamp
            axis: The axis definition with min/max values

        Returns:
            Clamped value within [axis.min_value, axis.max_value]
        """
        return max(axis.min_value, min(axis.max_value, float(value)))

    @staticmethod
    def clamp_stat_values(
        stat_values: Dict[str, float],
        stat_definition: StatDefinition
    ) -> Dict[str, float]:
        """
        Clamp all stat values to their respective axis ranges.

        Args:
            stat_values: Map of axis_name -> value
            stat_definition: The stat definition with axis definitions

        Returns:
            Clamped stat values
        """
        axes_by_name = {axis.name: axis for axis in stat_definition.axes}
        clamped = {}

        for axis_name, value in stat_values.items():
            if axis_name in axes_by_name:
                clamped[axis_name] = StatEngine.clamp_value(value, axes_by_name[axis_name])
            else:
                # Keep unknown axes as-is (for forward compatibility)
                clamped[axis_name] = value

        return clamped

    @staticmethod
    def compute_tier(
        axis_name: str,
        value: float,
        tiers: List[StatTier]
    ) -> Optional[str]:
        """
        Compute the tier ID for a single axis value.

        Args:
            axis_name: Name of the axis
            value: The axis value
            tiers: List of tier definitions

        Returns:
            The tier ID (e.g., "friend", "expert") or None if no match
        """
        # Filter tiers for this axis
        axis_tiers = [t for t in tiers if t.axis_name == axis_name]

        if not axis_tiers:
            return None

        # Sort tiers by min value for deterministic matching
        sorted_tiers = sorted(axis_tiers, key=lambda t: t.min)

        # Find the matching tier (first match wins)
        for tier in sorted_tiers:
            if tier.max is not None:
                if tier.min <= value <= tier.max:
                    return tier.id
            else:
                # Unbounded max
                if value >= tier.min:
                    return tier.id

        return None

    @staticmethod
    def compute_level(
        stat_values: Dict[str, float],
        levels: List[StatLevel]
    ) -> Optional[str]:
        """
        Compute the level ID based on multi-axis conditions.

        Args:
            stat_values: Map of axis_name -> value
            levels: List of level definitions

        Returns:
            The level ID (e.g., "intimate", "battle_ready") or None if no match
        """
        if not levels:
            return None

        # Sort levels by priority (highest first)
        sorted_levels = sorted(levels, key=lambda l: l.priority, reverse=True)

        # Find the first matching level
        for level in sorted_levels:
            if level.matches(stat_values):
                return level.id

        return None

    @staticmethod
    def normalize_entity_stats(
        entity_stats: Dict[str, Any],
        stat_definition: StatDefinition
    ) -> Dict[str, Any]:
        """
        Normalize stats for a single entity (e.g., one NPC's relationship data).

        Adds computed fields:
        - For each axis with tiers: "{axis_name}TierId"
        - If levels are defined: "levelId"

        Args:
            entity_stats: Raw stat values for one entity
            stat_definition: The stat definition

        Returns:
            Normalized stats with computed tier/level IDs

        Example:
            Input: {"affinity": 75, "trust": 60}
            Output: {"affinity": 75, "affinityTierId": "friend", "trust": 60, "trustTierId": "trusted", "levelId": "intimate"}
        """
        # Clone the input
        normalized = dict(entity_stats)

        # Extract raw numeric values (ignore computed fields)
        axis_names = {axis.name for axis in stat_definition.axes}
        stat_values = {
            name: value
            for name, value in entity_stats.items()
            if name in axis_names and isinstance(value, (int, float))
        }

        # Clamp values
        stat_values = StatEngine.clamp_stat_values(stat_values, stat_definition)

        # Update normalized dict with clamped values
        normalized.update(stat_values)

        # Compute tiers for each axis
        for axis in stat_definition.axes:
            if axis.name not in stat_values:
                continue

            tier_id = StatEngine.compute_tier(
                axis.name,
                stat_values[axis.name],
                stat_definition.tiers
            )

            if tier_id:
                # Store as "{axis_name}TierId"
                tier_key = f"{axis.name}TierId"
                normalized[tier_key] = tier_id

        # Compute level from all axes
        if stat_definition.levels:
            level_id = StatEngine.compute_level(stat_values, stat_definition.levels)
            if level_id:
                normalized["levelId"] = level_id

        return normalized

    @staticmethod
    def normalize_all_stats(
        all_stats: Dict[str, Dict[str, Any]],
        stat_definition: StatDefinition
    ) -> Dict[str, Dict[str, Any]]:
        """
        Normalize stats for all entities.

        Args:
            all_stats: Map of entity_id -> entity_stats
            stat_definition: The stat definition

        Returns:
            Normalized stats for all entities

        Example:
            Input: {"npc:1": {"affinity": 75}, "npc:2": {"affinity": 40}}
            Output: {"npc:1": {"affinity": 75, "affinityTierId": "friend"}, "npc:2": {"affinity": 40, "affinityTierId": "acquaintance"}}
        """
        return {
            entity_id: StatEngine.normalize_entity_stats(entity_stats, stat_definition)
            for entity_id, entity_stats in all_stats.items()
        }

    @staticmethod
    def initialize_entity_stats(stat_definition: StatDefinition) -> Dict[str, float]:
        """
        Initialize stat values with defaults from the definition.

        Args:
            stat_definition: The stat definition

        Returns:
            Map of axis_name -> default_value

        Example:
            For relationships: {"affinity": 0, "trust": 0, "chemistry": 0, "tension": 0}
        """
        return {
            axis.name: axis.default_value
            for axis in stat_definition.axes
        }
