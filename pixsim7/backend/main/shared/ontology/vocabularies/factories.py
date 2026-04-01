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
    PromptRoleDef,
    PoseDef,
    MoodDef,
    RatingDef,
    LocationDef,
    PartDef,
    SpeciesDef,
    InfluenceRegionDef,
    SpatialDef,
    CameraDef,
    ProgressionDef,
    GenericVocabDef,
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
    is_group = data.get("is_group", False)
    parent = data.get("parent")
    # Auto-derive parent from ID convention: role:entities:main_character → role:entities
    if parent is None and not is_group:
        bare = id[5:] if id.startswith("role:") else id
        if ":" in bare:
            parent = "role:" + bare.split(":")[0]
    return RoleDef(
        id=id,
        label=data.get("label", ""),
        description=data.get("description", ""),
        color=data.get("color", "gray"),
        default_layer=data.get("default_layer", 0),
        default_influence=data.get("default_influence", data.get("defaultInfluence", "content")),
        slots=SlotBinding(
            provides=slots_data.get("provides", []),
            requires=slots_data.get("requires", []),
        ),
        tags=data.get("tags", []),
        aliases=data.get("aliases", []),
        parent=parent,
        is_group=is_group,
        source=source,
    )


def make_prompt_role(id: str, data: Dict[str, Any], source: str) -> PromptRoleDef:
    """Create a PromptRoleDef from YAML data."""
    priority_value = data.get("priority")
    priority = int(priority_value) if priority_value is not None else None
    return PromptRoleDef(
        id=id,
        label=data.get("label", ""),
        description=data.get("description", ""),
        priority=priority,
        composition_role=data.get("composition_role", data.get("compositionRole")),
        keywords=data.get("keywords", []),
        action_verbs=data.get("action_verbs", data.get("actionVerbs", [])),
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
        scope=data.get("scope", ""),
        keywords=data.get("keywords", []),
        source=source,
    )


def make_species(id: str, data: Dict[str, Any], source: str) -> SpeciesDef:
    """Create a SpeciesDef from YAML data."""
    from pixsim7.backend.main.shared.ontology.vocabularies.modifiers import (
        FixedValue,
        GradedList,
        PronounSet,
        hydrate_modifier,
    )

    anatomy_map = data.get("anatomy_map", {})
    movement_verbs = data.get("movement_verbs", [])
    pronoun_set = data.get("pronoun_set", {})
    default_stance = data.get("default_stance", "standing")

    # Build unified modifier dict from existing fields
    modifiers: Dict[str, Any] = {}
    for key, val in anatomy_map.items():
        modifiers[key] = FixedValue(val)
    if movement_verbs:
        modifiers["movement"] = GradedList(movement_verbs)
    if default_stance:
        modifiers["stance"] = FixedValue(default_stance)
    if pronoun_set:
        modifiers["pronoun"] = PronounSet(pronoun_set)

    # Hydrate extra word_lists from YAML (pure YAML extensibility)
    for key, val in data.get("word_lists", {}).items():
        modifiers[key] = hydrate_modifier(val)

    return SpeciesDef(
        id=id,
        label=data.get("label", ""),
        category=data.get("category", ""),
        anatomy_map=anatomy_map,
        movement_verbs=movement_verbs,
        pronoun_set=pronoun_set,
        default_stance=default_stance,
        keywords=data.get("keywords", []),
        visual_priority=data.get("visual_priority", []),
        render_template=data.get("render_template", ""),
        source=source,
        modifiers=modifiers,
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


def make_camera(id: str, data: Dict[str, Any], source: str) -> CameraDef:
    """Create a CameraDef from YAML data."""
    return CameraDef(
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


def make_generic(id: str, data: Dict[str, Any], source: str) -> GenericVocabDef:
    """Create a GenericVocabDef from YAML data."""
    label = data.get("label")
    if not label:
        label = id.replace("_", " ").title()
    return GenericVocabDef(
        id=id,
        label=str(label),
        data=data,
        source=source,
    )


__all__ = [
    "make_slot",
    "make_prompt_role",
    "make_role",
    "make_pose",
    "make_mood",
    "make_rating",
    "make_location",
    "make_part",
    "make_species",
    "make_influence_region",
    "make_spatial",
    "make_camera",
    "make_progression",
    "make_generic",
]
