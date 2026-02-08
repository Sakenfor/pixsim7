"""
ActionBlock Tagging Helpers

Provides utilities for normalizing and aligning ActionBlock tags with ontology IDs.
This helps ensure consistent semantic metadata across the system.
"""
from typing import Dict, Any


def normalize_tags(raw_tags: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize ActionBlock tags to use ontology IDs where possible.

    Takes raw tag dict and, where possible, replaces/augments ad-hoc strings
    with ontology IDs (e.g., 'intimacy_level': 'soft' -> 'intensity:soft').

    This is a shallow mapping using the ontology's intensity/speed labels
    and domain keyword matching.

    Args:
        raw_tags: Raw tag dictionary with ad-hoc string values

    Returns:
        Normalized tag dictionary with ontology IDs where applicable

    Example:
        >>> normalize_tags({"intimacy_level": "soft", "mood": "playful"})
        {"intimacy_level": "intensity:soft", "mood": "mood:playful"}
    """
    if not raw_tags:
        return {}

    # Create a copy to avoid mutating the input
    normalized = raw_tags.copy()

    try:
        # Normalize intensity-related tags
        if "intimacy_level" in normalized:
            level = str(normalized["intimacy_level"]).lower()
            if level in ("soft", "low", "gentle"):
                normalized["intimacy_level"] = "intensity:soft"
            elif level in ("medium", "moderate"):
                normalized["intimacy_level"] = "intensity:medium"
            elif level in ("high", "intense", "hard"):
                normalized["intimacy_level"] = "intensity:high"

        if "intensity" in normalized:
            intensity = str(normalized["intensity"]).lower()
            if intensity in ("soft", "low", "gentle"):
                normalized["intensity"] = "intensity:soft"
            elif intensity in ("medium", "moderate"):
                normalized["intensity"] = "intensity:medium"
            elif intensity in ("high", "intense", "hard"):
                normalized["intensity"] = "intensity:high"

        # Normalize speed-related tags
        if "speed" in normalized:
            speed = str(normalized["speed"]).lower()
            if speed in ("slow", "gentle"):
                normalized["speed"] = "speed:slow"
            elif speed in ("medium", "moderate"):
                normalized["speed"] = "speed:medium"
            elif speed in ("fast", "quick", "rapid"):
                normalized["speed"] = "speed:fast"

        # Normalize mood tags to ontology mood IDs
        if "mood" in normalized:
            mood = str(normalized["mood"]).lower()
            mood_map = {
                "confident": "mood:confident",
                "nervous": "mood:nervous",
                "intimidated": "mood:intimidated",
                "eager": "mood:eager",
                "playful": "mood:playful",
            }
            if mood in mood_map:
                normalized["mood"] = mood_map[mood]

        # Add ontology_ids field if we have semantic content
        # This collects all ontology IDs present in the tags
        ontology_ids = []

        for key, value in normalized.items():
            if isinstance(value, str):
                # If the value looks like an ontology ID (contains ':'), collect it
                if ":" in value and value.split(":")[0] in (
                    # Core vocabulary prefixes
                    "pose", "mood", "location", "rating", "role",
                    "intimacy", "branch", "spatial", "camera", "influence_region",
                    "part",
                    "intensity", "speed"
                ):
                    ontology_ids.append(value)

        if ontology_ids:
            normalized["ontology_ids"] = ontology_ids

    except Exception:
        # If ontology loading fails, just return the original tags
        # (graceful degradation)
        pass

    return normalized


def extract_ontology_ids_from_tags(tags: Dict[str, Any]) -> list[str]:
    """
    Extract all ontology IDs present in ActionBlock tags.

    Args:
        tags: ActionBlock tags dictionary

    Returns:
        List of ontology IDs found in the tags

    Example:
        >>> extract_ontology_ids_from_tags({"mood": "mood:playful", "intensity": "intensity:soft"})
        ["mood:playful", "intensity:soft"]
    """
    ontology_ids = []

    # Check if there's already an ontology_ids field
    if "ontology_ids" in tags and isinstance(tags["ontology_ids"], list):
        ontology_ids.extend(tags["ontology_ids"])

    # Scan all tag values for ontology ID patterns
    for key, value in tags.items():
        if key == "ontology_ids":
            continue

        if isinstance(value, str):
            # If the value looks like an ontology ID (contains ':'), collect it
            if ":" in value and value.split(":")[0] in (
                # Core vocabulary prefixes
                "pose", "mood", "location", "rating", "role",
                "intimacy", "branch", "spatial", "camera", "influence_region",
                "part",
                "intensity", "speed"
            ):
                if value not in ontology_ids:
                    ontology_ids.append(value)

    return ontology_ids
