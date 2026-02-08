"""
Unified Vocabulary System.

This package provides a centralized registry for all vocabulary types:
- slots (provides/requires matching)
- prompt_roles (prompt segment roles)
- roles (composition roles)
- poses (character poses)
- moods (emotional tones)
- ratings (content ratings)
- locations (scene locations)
- parts (anatomy parts)
- influence_regions (effect regions)
- spatial (orientation/depth/layout)
- camera (camera angle/framing)
- progression (tension/intimacy)

Usage:
    from pixsim7.backend.main.shared.ontology.vocabularies import (
        get_registry,
        get_pose,
        match_keywords,
    )

    # Get a pose
    pose = get_pose("pose:standing_neutral")

    # Match keywords in text
    ids = match_keywords("she is standing near the beach")
"""
from typing import List, Optional

# Re-export types
from pixsim7.backend.main.shared.ontology.vocabularies.types import (
    SlotDef,
    SlotBinding,
    Progression,
    RoleDef,
    PromptRoleDef,
    PoseDef,
    MoodDef,
    RatingDef,
    LocationDef,
    PartDef,
    InfluenceRegionDef,
    SpatialDef,
    CameraDef,
    ProgressionDef,
    ScoringConfig,
    ScoringWeights,
    PartialCredit,
    ChainConstraints,
    DurationConstraints,
    VocabPackInfo,
)

# Re-export config
from pixsim7.backend.main.shared.ontology.vocabularies.config import (
    VocabTypeConfig,
    VOCAB_CONFIGS,
)

# Re-export registry
from pixsim7.backend.main.shared.ontology.vocabularies.registry import (
    VocabularyRegistry,
    get_registry,
    reset_registry,
)


# =============================================================================
# Convenience functions (delegate to singleton registry)
# =============================================================================

def get_slot(slot_id: str) -> Optional[SlotDef]:
    """Get a slot by ID."""
    return get_registry().get_slot(slot_id)


def get_role(role_id: str) -> Optional[RoleDef]:
    """Get a role by ID."""
    return get_registry().get_role(role_id)


def get_prompt_role(role_id: str) -> Optional[PromptRoleDef]:
    """Get a prompt role by ID."""
    return get_registry().get_prompt_role(role_id)


def get_pose(pose_id: str) -> Optional[PoseDef]:
    """Get a pose by ID."""
    return get_registry().get_pose(pose_id)


def get_mood(mood_id: str) -> Optional[MoodDef]:
    """Get a mood by ID."""
    return get_registry().get_mood(mood_id)


def get_rating(rating_id: str) -> Optional[RatingDef]:
    """Get a rating by ID."""
    return get_registry().get_rating(rating_id)


def get_location(location_id: str) -> Optional[LocationDef]:
    """Get a location by ID."""
    return get_registry().get_location(location_id)


def get_part(part_id: str) -> Optional[PartDef]:
    """Get a part by ID."""
    return get_registry().get_part(part_id)


def get_influence_region(region_id: str) -> Optional[InfluenceRegionDef]:
    """Get an influence region by ID."""
    return get_registry().get_influence_region(region_id)


def get_spatial(spatial_id: str) -> Optional[SpatialDef]:
    """Get a spatial item by ID."""
    return get_registry().get_spatial(spatial_id)


def get_camera(camera_id: str) -> Optional[CameraDef]:
    """Get a camera item by ID."""
    return get_registry().get_camera(camera_id)


def get_progression(progression_id: str) -> Optional[ProgressionDef]:
    """Get a progression item by ID."""
    return get_registry().get_progression(progression_id)


def check_pose_compatibility(pose_a_id: str, pose_b_id: str) -> bool:
    """Check if two poses are compatible for composition."""
    return get_registry().check_pose_compatibility(pose_a_id, pose_b_id)


def match_keywords(text: str) -> List[str]:
    """Match keywords in text to vocabulary IDs."""
    return get_registry().match_keywords(text)


__all__ = [
    # Types
    "SlotDef",
    "SlotBinding",
    "Progression",
    "RoleDef",
    "PromptRoleDef",
    "PoseDef",
    "MoodDef",
    "RatingDef",
    "LocationDef",
    "PartDef",
    "InfluenceRegionDef",
    "SpatialDef",
    "CameraDef",
    "ProgressionDef",
    "ScoringConfig",
    "ScoringWeights",
    "PartialCredit",
    "ChainConstraints",
    "DurationConstraints",
    "VocabPackInfo",
    # Config
    "VocabTypeConfig",
    "VOCAB_CONFIGS",
    # Registry
    "VocabularyRegistry",
    "get_registry",
    "reset_registry",
    # Convenience functions
    "get_slot",
    "get_role",
    "get_prompt_role",
    "get_pose",
    "get_mood",
    "get_rating",
    "get_location",
    "get_part",
    "get_influence_region",
    "get_spatial",
    "get_camera",
    "get_progression",
    "check_pose_compatibility",
    "match_keywords",
]
