"""ActionBlock tag helpers — ontology-id extraction from block.tags dicts."""
from typing import Dict, Any


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
