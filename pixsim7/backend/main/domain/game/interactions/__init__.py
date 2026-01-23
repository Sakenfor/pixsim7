"""Interaction mechanics"""

from .interactions import (
    StatDelta,
    FlagChanges,
    InventoryChanges,
)

from .interaction_execution import (
    apply_stat_deltas,
    apply_flag_changes,
    apply_inventory_changes,
)

__all__ = [
    # Interaction types
    "StatDelta",
    "FlagChanges",
    "InventoryChanges",
    # Execution
    "apply_stat_deltas",
    "apply_flag_changes",
    "apply_inventory_changes",
]
