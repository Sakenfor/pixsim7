"""
Type definitions for the metric evaluation system.
"""

from typing import Any, Protocol
from enum import Enum
from sqlalchemy.ext.asyncio import AsyncSession


class MetricType(str, Enum):
    """Supported metric types for preview/evaluation."""

    NPC_MOOD = "npc_mood"
    REPUTATION_BAND = "reputation_band"

    # Future metrics can be added here:
    # SKILL_LEVEL = "skill_level"
    # FACTION_STANDING = "faction_standing"
    # SOCIAL_STANDING = "social_standing"


class MetricEvaluator(Protocol):
    """Protocol for metric evaluator functions."""

    async def __call__(
        self, world_id: int, payload: dict[str, Any], db: AsyncSession
    ) -> dict[str, Any]:
        """
        Evaluate a metric for a given world and input payload.

        Args:
            world_id: The world ID for schema/context lookup
            payload: Metric-specific input data
            db: Database session for loading world data

        Returns:
            Metric-specific result dictionary

        Raises:
            ValueError: For invalid inputs or world not found
        """
        ...
