"""
Mixins for entity-owned stats.

Provides reusable stats field and utilities for any model that needs stat tracking.
"""

from typing import Dict, Any
from sqlmodel import Field
from sqlalchemy import JSON


class HasStats:
    """
    Mixin for models that own stats.

    Add this to any SQLModel to give it a stats field with the same structure
    as the abstract stat system.

    Usage:
        class GameNPC(SQLModel, HasStats, table=True):
            id: int
            name: str
            # stats field inherited from HasStats

    The stats field structure matches GameSession.stats:
        {
            "combat_skills": {
                "strength": 90,
                "strengthTierId": "expert"
            },
            "attributes": {
                "health": 100,
                "mana": 50
            }
        }

    This enables:
    - NPCs with base stats
    - Items/equipment with stat modifiers
    - Locations with environmental effects
    - Any entity that needs stat tracking
    """

    stats: Dict[str, Any] = Field(
        default_factory=dict,
        sa_type=JSON,
        description="Entity stats. Structure: {stat_definition_id: {axis: value, ...}}"
    )


class HasStatsWithMetadata:
    """
    Extended mixin with additional stat metadata.

    Includes fields for tracking stat modifications, sources, and history.

    Usage:
        class GameItem(SQLModel, HasStatsWithMetadata, table=True):
            id: int
            name: str
            # stats and stats_metadata inherited

    The stats_metadata field can track:
    - Modification sources (equipment, buffs, etc.)
    - Temporary vs permanent changes
    - Expiration times for buffs
    - Change history
    """

    stats: Dict[str, Any] = Field(
        default_factory=dict,
        sa_type=JSON,
        description="Entity stats. Structure: {stat_definition_id: {axis: value, ...}}"
    )

    stats_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        sa_type=JSON,
        description="Stat modification metadata (sources, expiration, history)"
    )


# Example metadata structure:
# stats_metadata = {
#     "combat_skills": {
#         "modifiers": [
#             {
#                 "source": "equipment:sword_of_power",
#                 "type": "additive",
#                 "axis": "strength",
#                 "value": 10,
#                 "expires_at": None  # Permanent
#             },
#             {
#                 "source": "buff:battle_rage",
#                 "type": "multiplicative",
#                 "axis": "strength",
#                 "value": 1.5,  # 50% increase
#                 "expires_at": "2025-12-02T12:00:00Z"
#             }
#         ]
#     }
# }
