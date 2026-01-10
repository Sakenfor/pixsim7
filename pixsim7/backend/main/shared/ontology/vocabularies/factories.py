"""
Vocabulary factory functions.

Each factory converts raw YAML dict data into typed dataclasses.
"""
from typing import Any, Dict

from pixsim7.backend.main.shared.ontology.vocabularies.types import (
    SlotDef,
    SlotBinding,
    Progression,
    RoleDef,
    PoseDef,
    MoodDef,
    RatingDef,
    LocationDef,
    PartDef,
    InfluenceRegionDef,
    SpatialDef,
    ProgressionDef,
)


def make_slot(id: str, data: Dict[str, Any], source: str) -> SlotDef:
    """Create a SlotDef from YAML data."""
    return SlotDef(
        id=id,
        label=data.get("label", ""),
        category=data.get("category", ""),
        parent=data.get("parent"),
        inverse=data.get("inverse"),
        implies=data.get("implies", []),
        incompatible=data.get("incompatible", []),
        tension_modifier=data.get("tension_modifier", 0),
        source=source,
    )


def make_role(id: str, data: Dict[str, Any], source: str) -> RoleDef:
    """Create a RoleDef from YAML data."""
    slots_data = data.get("slots", {})
    return RoleDef(
        id=id,
        label=data.get("label", ""),
        description=data.get("description", ""),
        color=data.get("color", "gray"),
        default_layer=data.get("default_layer", 0),
        slots=SlotBinding(
            provides=slots_data.get("provides", []),
            requires=slots_data.get("requires", []),
        ),
        tags=data.get("tags", []),
        aliases=data.get("aliases", []),
        source=source,
    )


def make_pose(id: str, data: Dict[str, Any], source: str) -> PoseDef:
    """Create a PoseDef from YAML data."""
    slots_data = data.get("slots", {})
    prog_data = data.get("progression", {})
    return PoseDef(
        id=id,
        label=data.get("label", ""),
        category=data.get("category", ""),
        tension=data.get("tension", 0),
        parent=data.get("parent"),
        slots=SlotBinding(
            provides=slots_data.get("provides", []),
            requires=slots_data.get("requires", []),
        ),
        mood=data.get("mood", []),
        rating=data.get("rating"),
        progression=Progression(
            from_=prog_data.get("from", []),
            to=prog_data.get("to", []),
        ),
        detector_labels=data.get("detector_labels", []),
        tags=data.get("tags", []),
        special=data.get("special"),
        source=source,
    )


def make_mood(id: str, data: Dict[str, Any], source: str) -> MoodDef:
    """Create a MoodDef from YAML data."""
    tension_range = data.get("tension_range", [0, 10])
    return MoodDef(
        id=id,
        label=data.get("label", ""),
        category=data.get("category", ""),
        tension_range=tuple(tension_range),
        parent=data.get("parent"),
        keywords=data.get("keywords", []),
        compatible_ratings=data.get("compatible_ratings", []),
        source=source,
    )


def make_rating(id: str, data: Dict[str, Any], source: str) -> RatingDef:
    """Create a RatingDef from YAML data."""
    return RatingDef(
        id=id,
        label=data.get("label", ""),
        level=data.get("level", 0),
        description=data.get("description", ""),
        keywords=data.get("keywords", []),
        min_intimacy=data.get("min_intimacy", 0),
        requires_age_verification=data.get("requires_age_verification", False),
        source=source,
    )


def make_location(id: str, data: Dict[str, Any], source: str) -> LocationDef:
    """Create a LocationDef from YAML data."""
    return LocationDef(
        id=id,
        label=data.get("label", ""),
        category=data.get("category", ""),
        indoor=data.get("indoor", True),
        private=data.get("private", False),
        romantic=data.get("romantic", False),
        keywords=data.get("keywords", []),
        source=source,
    )


def make_part(id: str, data: Dict[str, Any], source: str) -> PartDef:
    """Create a PartDef from YAML data."""
    return PartDef(
        id=id,
        label=data.get("label", ""),
        category=data.get("category", ""),
        keywords=data.get("keywords", []),
        source=source,
    )


def make_influence_region(id: str, data: Dict[str, Any], source: str) -> InfluenceRegionDef:
    """Create an InfluenceRegionDef from YAML data."""
    return InfluenceRegionDef(
        id=id,
        label=data.get("label", ""),
        description=data.get("description", ""),
        color=data.get("color", "gray"),
        source=source,
    )


def make_spatial(id: str, data: Dict[str, Any], source: str) -> SpatialDef:
    """Create a SpatialDef from YAML data."""
    return SpatialDef(
        id=id,
        label=data.get("label", ""),
        category=data.get("category", ""),
        keywords=data.get("keywords", []),
        source=source,
    )


def make_progression(id: str, data: Dict[str, Any], source: str) -> ProgressionDef:
    """Create a ProgressionDef from YAML data."""
    return ProgressionDef(
        id=id,
        label=data.get("label", ""),
        kind=data.get("kind", ""),
        data=data.get("data", {}) or {},
        source=source,
    )


__all__ = [
    "make_slot",
    "make_role",
    "make_pose",
    "make_mood",
    "make_rating",
    "make_location",
    "make_part",
    "make_influence_region",
    "make_spatial",
    "make_progression",
]
