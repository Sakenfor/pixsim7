"""
Relationship tier and intimacy level computation helpers.
"""

from typing import Dict, Any, List, Optional, Tuple


def compute_relationship_tier(
    affinity: float,
    relationship_schemas: Dict[str, Any],
    schema_key: str = "default"
) -> Optional[str]:
    """
    Compute the relationship tier based on affinity value and world schema.

    Args:
        affinity: The affinity value (typically 0-100)
        relationship_schemas: World meta containing relationship tier definitions
        schema_key: Which schema to use (default: "default")

    Returns:
        The tier ID (e.g., "friend", "lover") or None if no match
    """
    # Clamp affinity to valid range (0-100) to prevent out-of-bounds values
    affinity = max(0.0, min(100.0, float(affinity)))

    if not relationship_schemas or schema_key not in relationship_schemas:
        # Fallback to hardcoded defaults if no schema
        return _default_relationship_tier(affinity)

    tiers = relationship_schemas[schema_key]
    if not isinstance(tiers, list):
        return _default_relationship_tier(affinity)

    # Sort tiers by min value for deterministic matching
    # This ensures overlapping ranges always match the same tier
    sorted_tiers = sorted(tiers, key=lambda t: t.get("min", 0))

    # Find the matching tier (first match wins)
    for tier in sorted_tiers:
        if "min" in tier and "max" in tier:
            if tier["min"] <= affinity <= tier["max"]:
                return tier.get("id")
        elif "min" in tier:
            if affinity >= tier["min"]:
                return tier.get("id")

    return None


def _default_relationship_tier(affinity: float) -> str:
    """Fallback relationship tiers if none defined in world."""
    if affinity >= 80:
        return "lover"
    elif affinity >= 60:
        return "close_friend"
    elif affinity >= 30:
        return "friend"
    elif affinity >= 10:
        return "acquaintance"
    else:
        return "stranger"


def compute_intimacy_level(
    relationship_values: Dict[str, float],
    intimacy_schema: Optional[Dict[str, Any]] = None
) -> Optional[str]:
    """
    Compute the intimacy level based on multiple relationship axes.

    Args:
        relationship_values: Dict with affinity, trust, chemistry, tension values
        intimacy_schema: World meta containing intimacy level definitions

    Returns:
        The intimacy level ID (e.g., "intimate", "light_flirt") or None
    """
    if not intimacy_schema or "levels" not in intimacy_schema:
        # Fallback to simple computation
        return _default_intimacy_level(relationship_values)

    levels = intimacy_schema.get("levels", [])
    if not isinstance(levels, list):
        return _default_intimacy_level(relationship_values)

    # Clamp all values to valid range (0-100) to prevent out-of-bounds values
    affinity = max(0.0, min(100.0, float(relationship_values.get("affinity", 0))))
    trust = max(0.0, min(100.0, float(relationship_values.get("trust", 0))))
    chemistry = max(0.0, min(100.0, float(relationship_values.get("chemistry", 0))))
    tension = max(0.0, min(100.0, float(relationship_values.get("tension", 0))))

    # Check levels from most intimate to least (assuming they're ordered)
    matched_level = None
    for level in reversed(levels):
        meets_criteria = True

        # Check each axis threshold
        if "minAffinity" in level and affinity < level["minAffinity"]:
            meets_criteria = False
        if "minTrust" in level and trust < level["minTrust"]:
            meets_criteria = False
        if "minChemistry" in level and chemistry < level["minChemistry"]:
            meets_criteria = False
        if "maxTension" in level and tension > level["maxTension"]:
            meets_criteria = False

        if meets_criteria:
            matched_level = level.get("id")
            break

    return matched_level


def _default_intimacy_level(relationship_values: Dict[str, float]) -> Optional[str]:
    """Fallback intimacy computation if no schema defined."""
    affinity = relationship_values.get("affinity", 0)
    chemistry = relationship_values.get("chemistry", 0)
    trust = relationship_values.get("trust", 0)

    # Very intimate: high on all positive axes
    if affinity >= 80 and chemistry >= 80 and trust >= 60:
        return "very_intimate"

    # Intimate: good values across the board
    if affinity >= 60 and chemistry >= 60 and trust >= 40:
        return "intimate"

    # Deep flirt: some chemistry and affinity
    if affinity >= 40 and chemistry >= 40 and trust >= 20:
        return "deep_flirt"

    # Light flirt: minimal chemistry
    if affinity >= 20 and chemistry >= 20:
        return "light_flirt"

    return None


def merge_npc_persona(
    base_personality: Dict[str, Any],
    world_overrides: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Merge base NPC personality with world-specific overrides.

    Args:
        base_personality: GameNPC.personality data
        world_overrides: GameWorld.meta.npc_overrides[npc_id] data

    Returns:
        Merged personality dictionary
    """
    if not world_overrides:
        return base_personality.copy() if base_personality else {}

    merged = base_personality.copy() if base_personality else {}

    # Apply personality overrides
    if "personality" in world_overrides:
        personality_overrides = world_overrides["personality"]
        if isinstance(personality_overrides, dict):
            merged.update(personality_overrides)

    # Apply other overrides at top level
    for key in ["tags", "nameOverride", "conversationStyle"]:
        if key in world_overrides:
            merged[key] = world_overrides[key]

    return merged


def extract_relationship_values(
    relationships_data: Dict[str, Any],
    npc_id: int
) -> Tuple[float, float, float, float, Dict[str, Any]]:
    """
    Extract relationship values for a specific NPC from session relationships.

    Args:
        relationships_data: GameSession.relationships data
        npc_id: The NPC ID to extract values for

    Returns:
        Tuple of (affinity, trust, chemistry, tension, flags)
    """
    npc_key = f"npc:{npc_id}"

    if npc_key not in relationships_data:
        return 0.0, 0.0, 0.0, 0.0, {}

    npc_rel = relationships_data[npc_key]
    if not isinstance(npc_rel, dict):
        return 0.0, 0.0, 0.0, 0.0, {}

    affinity = float(npc_rel.get("affinity", 0))
    trust = float(npc_rel.get("trust", 0))
    chemistry = float(npc_rel.get("chemistry", 0))
    tension = float(npc_rel.get("tension", 0))
    flags = npc_rel.get("flags", {})

    return affinity, trust, chemistry, tension, flags