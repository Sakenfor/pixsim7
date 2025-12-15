"""NPC interaction mechanics"""

from .npc_interactions import (
    RelationshipDelta,
    StatDelta,
    FlagChanges,
    InventoryChanges,
)

from .interaction_execution import (
    apply_relationship_deltas,
    apply_stat_deltas,
    apply_flag_changes,
    apply_inventory_changes,
)

__all__ = [
    # Interaction types
    "RelationshipDelta",
    "StatDelta",
    "FlagChanges",
    "InventoryChanges",
    # Execution
    "apply_relationship_deltas",
    "apply_stat_deltas",
    "apply_flag_changes",
    "apply_inventory_changes",
]
