"""
Vocabulary type definitions (dataclasses).

All vocabulary item types are defined here for clean separation.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class SlotDef:
    """A slot definition for provides/requires matching."""
    id: str
    label: str
    category: str = ""
    parent: Optional[str] = None
    inverse: Optional[str] = None
    implies: List[str] = field(default_factory=list)
    incompatible: List[str] = field(default_factory=list)
    tension_modifier: int = 0
    source: str = "core"


@dataclass
class SlotBinding:
    """Slots provided and required by an entity."""
    provides: List[str] = field(default_factory=list)
    requires: List[str] = field(default_factory=list)


@dataclass
class Progression:
    """Progression paths for poses."""
    from_: List[str] = field(default_factory=list)
    to: List[str] = field(default_factory=list)


@dataclass
class RoleDef:
    """A composition role definition."""
    id: str
    label: str
    description: str = ""
    color: str = "gray"
    default_layer: int = 0
    slots: SlotBinding = field(default_factory=SlotBinding)
    tags: List[str] = field(default_factory=list)
    aliases: List[str] = field(default_factory=list)
    source: str = "core"


@dataclass
class PoseDef:
    """A pose definition with full cross-cutting properties."""
    id: str
    label: str
    category: str = ""
    tension: int = 0
    parent: Optional[str] = None
    slots: SlotBinding = field(default_factory=SlotBinding)
    mood: List[str] = field(default_factory=list)
    rating: Optional[str] = None
    progression: Progression = field(default_factory=Progression)
    detector_labels: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    special: Optional[str] = None
    source: str = "core"


@dataclass
class MoodDef:
    """A mood definition."""
    id: str
    label: str
    category: str = ""
    tension_range: Tuple[int, int] = (0, 10)
    parent: Optional[str] = None
    keywords: List[str] = field(default_factory=list)
    compatible_ratings: List[str] = field(default_factory=list)
    source: str = "core"


@dataclass
class RatingDef:
    """A content rating definition."""
    id: str
    label: str
    level: int = 0
    description: str = ""
    keywords: List[str] = field(default_factory=list)
    min_intimacy: int = 0
    requires_age_verification: bool = False
    source: str = "core"


@dataclass
class LocationDef:
    """A location definition for scene context."""
    id: str
    label: str
    category: str = ""
    indoor: bool = True
    private: bool = False
    romantic: bool = False
    keywords: List[str] = field(default_factory=list)
    source: str = "core"


@dataclass
class PartDef:
    """An anatomy part definition (body parts and regions)."""
    id: str
    label: str
    category: str = ""
    keywords: List[str] = field(default_factory=list)
    source: str = "core"


@dataclass
class InfluenceRegionDef:
    """An influence region definition (areas for applying effects)."""
    id: str
    label: str
    description: str = ""
    color: str = "gray"
    source: str = "core"


@dataclass
class SpatialDef:
    """A spatial definition (camera, framing, orientation, depth)."""
    id: str
    label: str
    category: str = ""
    keywords: List[str] = field(default_factory=list)
    source: str = "core"


@dataclass
class ProgressionDef:
    """A progression definition (tension label, intimacy level, path, branch intent)."""
    id: str
    label: str
    kind: str
    data: Dict[str, Any] = field(default_factory=dict)
    source: str = "core"


# Scoring config dataclasses
@dataclass
class ScoringWeights:
    """Scoring weights for action block selection."""
    chain_compatibility: float = 0.30
    location_match: float = 0.20
    pose_match: float = 0.15
    intimacy_match: float = 0.15
    mood_match: float = 0.10
    branch_intent: float = 0.10


@dataclass
class PartialCredit:
    """Partial credit rules for scoring."""
    generic_block: float = 0.5
    parent_pose: float = 0.8
    same_category: float = 0.6
    adjacent_intimacy: float = 0.7


@dataclass
class ChainConstraints:
    """Chain building constraints."""
    max_blocks: int = 3
    min_remaining_budget: float = 3.0


@dataclass
class DurationConstraints:
    """Duration constraints for blocks."""
    min_block: float = 3.0
    max_block: float = 12.0
    default_single: float = 6.0
    default_transition: float = 7.0


@dataclass
class ScoringConfig:
    """Complete scoring configuration."""
    weights: ScoringWeights = field(default_factory=ScoringWeights)
    partial_credit: PartialCredit = field(default_factory=PartialCredit)
    chain: ChainConstraints = field(default_factory=ChainConstraints)
    duration: DurationConstraints = field(default_factory=DurationConstraints)


@dataclass
class VocabPackInfo:
    """Metadata about a loaded vocabulary pack."""
    id: str
    source_path: Optional[str]
    plugin_id: Optional[str]
    version: Optional[str] = None
    label: str = ""
    concepts_added: Dict[str, int] = field(default_factory=dict)


__all__ = [
    "SlotDef",
    "SlotBinding",
    "Progression",
    "RoleDef",
    "PoseDef",
    "MoodDef",
    "RatingDef",
    "LocationDef",
    "PartDef",
    "InfluenceRegionDef",
    "SpatialDef",
    "ProgressionDef",
    "ScoringWeights",
    "PartialCredit",
    "ChainConstraints",
    "DurationConstraints",
    "ScoringConfig",
    "VocabPackInfo",
]
