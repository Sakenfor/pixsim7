"""
Brain state types for NPC cognitive modeling.

Provides generic, data-driven brain state that adapts to whatever
stat packages a world uses. No hardcoded stat names or structures.
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class BrainStatSnapshot(BaseModel):
    """
    Snapshot of a single stat definition for one NPC.

    Contains current axis values plus computed tiers and levels.

    Example:
        BrainStatSnapshot(
            axes={"valence": 75, "arousal": 40},
            tiers={"valence": "high", "arousal": "moderate"},
            level_id="calm",
            level_ids=["calm", "content"],
        )
    """
    axes: Dict[str, float] = Field(default_factory=dict)
    tiers: Dict[str, str] = Field(default_factory=dict)  # axis_name -> tier_id
    level_id: Optional[str] = None  # Highest priority matching level
    level_ids: List[str] = Field(default_factory=list)  # All matching levels


class BrainState(BaseModel):
    """
    Generic NPC brain state - combines any stat packages the world uses.

    No hardcoded fields - everything comes from stat definitions and
    semantic derivations. Structure adapts to world configuration.

    stats: Numeric axis values with tiers and levels
        brain.stats["mood"].axes["valence"] = 75
        brain.stats["mood"].level_id = "calm"

    derived: Transformed values (labels, categories) from semantic derivations
        brain.derived["mood"]["label"] = "calm"
        brain.derived["mood"]["valence"] = 75  # Also includes axes for convenience

    Example:
        brain.stats = {
            "personality": BrainStatSnapshot(axes={"openness": 75, ...}),
            "mood": BrainStatSnapshot(axes={"valence": 70, "arousal": 30}, level_id="calm"),
            "relationships": BrainStatSnapshot(axes={"affinity": 80, ...}),
        }
        brain.derived = {
            "mood": {"valence": 70, "arousal": 30, "label": "calm"},
        }
    """
    npc_id: int
    world_id: int

    # Core: projection of all stat packages (explicit + derived)
    # Key = stat_definition_id (e.g., "personality", "mood", "relationships")
    stats: Dict[str, BrainStatSnapshot] = Field(default_factory=dict)

    # Derived values from semantic derivation transforms
    # Key = stat_definition_id, Value = dict with axes + transformed values (labels, etc.)
    derived: Dict[str, Any] = Field(default_factory=dict)

    # Metadata
    computed_at: float = 0.0  # Timestamp
    source_packages: List[str] = Field(default_factory=list)  # Which packages contributed
