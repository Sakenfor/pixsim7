"""
Ontology utility functions.

Helper functions for keyword matching, ID canonicalization, and ontology lookups.
"""
from typing import List, Dict, Any


def match_keywords_in_domain(domain_data: Dict[str, Any], text: str) -> List[str]:
    """
    Match keywords in text to ontology IDs from the domain section.

    Given lowercased text, return a list of ontology IDs that apply based on
    keyword matching against domain pack definitions.

    Args:
        domain_data: The domain section from ontology YAML
        text: Lowercased text to match

    Returns:
        List of ontology IDs (e.g., ["part:shaft", "state:erect"])
    """
    matched_ids: List[str] = []
    text_lower = text.lower()

    # Get domain packs
    packs = domain_data.get("packs", {})

    # For now, just search the "default" pack
    default_pack = packs.get("default", {})

    # Helper to check keywords in a domain category
    def check_category(category_name: str) -> None:
        category = default_pack.get(category_name, [])
        if not isinstance(category, list):
            return

        for item in category:
            if not isinstance(item, dict):
                continue

            item_id = item.get("id")
            keywords = item.get("keywords", [])

            if not item_id or not keywords:
                continue

            # Check if any keyword appears in text
            for keyword in keywords:
                if keyword.lower() in text_lower:
                    if item_id not in matched_ids:
                        matched_ids.append(item_id)
                    break

    # Check all domain categories
    check_category("anatomy_parts")
    check_category("anatomy_regions")
    check_category("actions")
    check_category("states_physical")
    check_category("states_emotional")
    check_category("states_positional")
    check_category("spatial_location")
    check_category("spatial_orientation")
    check_category("spatial_contact")
    check_category("camera_views")
    check_category("camera_framing")
    check_category("beats_sequence")
    check_category("beats_micro")

    return matched_ids


__all__ = [
    "match_keywords_in_domain",
]
