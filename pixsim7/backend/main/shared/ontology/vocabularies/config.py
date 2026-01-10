"""
Vocabulary configuration.

Defines VocabTypeConfig and the registry of all vocab types.
"""
from dataclasses import dataclass
from typing import Any, Callable, Dict, Generic, Optional, TypeVar

T = TypeVar("T")


@dataclass
class VocabTypeConfig(Generic[T]):
    """Configuration for a vocabulary type."""
    name: str                          # e.g., "slots"
    yaml_file: str                     # e.g., "slots.yaml"
    yaml_key: str                      # e.g., "slots" (key in YAML)
    factory: Callable[[str, Dict[str, Any], str], T]  # Creates dataclass from dict
    keywords_attr: Optional[str] = None  # Attribute containing keywords for matching


# Import factories here to avoid circular imports
# (factories imports types, config imports factories)
from pixsim7.backend.main.shared.ontology.vocabularies.factories import (
    make_slot,
    make_role,
    make_pose,
    make_mood,
    make_rating,
    make_location,
    make_part,
    make_influence_region,
    make_spatial,
    make_progression,
)


# All vocab types with their configs
VOCAB_CONFIGS: Dict[str, VocabTypeConfig] = {
    "slots": VocabTypeConfig(
        name="slots",
        yaml_file="slots.yaml",
        yaml_key="slots",
        factory=make_slot,
        keywords_attr=None,  # Slots don't have keywords
    ),
    "roles": VocabTypeConfig(
        name="roles",
        yaml_file="roles.yaml",
        yaml_key="roles",
        factory=make_role,
        keywords_attr="aliases",  # Roles use aliases for matching
    ),
    "poses": VocabTypeConfig(
        name="poses",
        yaml_file="poses.yaml",
        yaml_key="poses",
        factory=make_pose,
        keywords_attr="detector_labels",  # Poses use detector_labels
    ),
    "moods": VocabTypeConfig(
        name="moods",
        yaml_file="moods.yaml",
        yaml_key="moods",
        factory=make_mood,
        keywords_attr="keywords",
    ),
    "ratings": VocabTypeConfig(
        name="ratings",
        yaml_file="ratings.yaml",
        yaml_key="ratings",
        factory=make_rating,
        keywords_attr="keywords",
    ),
    "locations": VocabTypeConfig(
        name="locations",
        yaml_file="locations.yaml",
        yaml_key="locations",
        factory=make_location,
        keywords_attr="keywords",
    ),
    "parts": VocabTypeConfig(
        name="parts",
        yaml_file="anatomy.yaml",
        yaml_key="parts",
        factory=make_part,
        keywords_attr="keywords",
    ),
    "influence_regions": VocabTypeConfig(
        name="influence_regions",
        yaml_file="influence_regions.yaml",
        yaml_key="regions",
        factory=make_influence_region,
        keywords_attr=None,  # Influence regions don't have keywords
    ),
    "spatial": VocabTypeConfig(
        name="spatial",
        yaml_file="spatial.yaml",
        yaml_key="spatial",
        factory=make_spatial,
        keywords_attr="keywords",
    ),
    "progression": VocabTypeConfig(
        name="progression",
        yaml_file="progression.yaml",
        yaml_key="progression",
        factory=make_progression,
        keywords_attr=None,  # Progression items don't have keywords
    ),
}


__all__ = [
    "VocabTypeConfig",
    "VOCAB_CONFIGS",
]
