"""
Reputation & Faction Metric Evaluators

Provides reputation band evaluation for player-NPC, NPC-NPC, and faction relationships.
"""

from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.game.models import GameWorld, GameSession


def _default_reputation_band(reputation_score: float) -> str:
    """
    Derive reputation band from score using hardcoded defaults.

    Default bands (0-100 scale):
    - enemy: 0-20
    - hostile: 20-40
    - neutral: 40-60
    - friendly: 60-80
    - ally: 80-100

    Args:
        reputation_score: Reputation score (0-100)

    Returns:
        Reputation band string
    """
    if reputation_score < 20:
        return "enemy"
    elif reputation_score < 40:
        return "hostile"
    elif reputation_score < 60:
        return "neutral"
    elif reputation_score < 80:
        return "friendly"
    else:
        return "ally"


def _compute_reputation_from_schema(
    reputation_score: float,
    reputation_schema: Optional[dict[str, Any]]
) -> str:
    """
    Compute reputation band using world-specific reputation schema.

    Schema format:
    {
      "bands": [
        {
          "id": "enemy",
          "min": 0,
          "max": 20
        },
        {
          "id": "hostile",
          "min": 20,
          "max": 40
        },
        ...
      ]
    }

    Args:
        reputation_score: Reputation score (0-100)
        reputation_schema: Optional reputation schema from GameWorld.meta

    Returns:
        Reputation band string
    """
    if not reputation_schema or "bands" not in reputation_schema:
        return _default_reputation_band(reputation_score)

    bands = reputation_schema.get("bands", [])

    # Find first matching band based on score range
    for band in bands:
        min_score = band.get("min", 0)
        max_score = band.get("max", 100)

        if min_score <= reputation_score < max_score:
            return band["id"]

    # Fallback to default if no match
    return _default_reputation_band(reputation_score)


async def evaluate_reputation_band(
    world_id: int,
    payload: dict[str, Any],
    db: AsyncSession
) -> dict[str, Any]:
    """
    Evaluate reputation band metric based on reputation score or relationship data.

    Supports multiple reputation types:
    1. Player-to-NPC: Based on relationship affinity or explicit reputation
    2. NPC-to-NPC: Based on stored NPC-NPC relationship data
    3. Faction-based: Based on faction membership and standings

    Args:
        world_id: World ID for schema lookup
        payload: Dict with:
            - subject_id (int, required): Subject entity ID (player or NPC)
            - subject_type (str, required): "player" or "npc"
            - target_id (int, optional): Target entity ID (NPC, faction, group)
            - target_type (str, optional): "npc", "faction", or "group"
            - reputation_score (float, optional): Explicit reputation score (0-100)
            - session_id (int, optional): Session ID for relationship lookup
            - faction_membership (dict, optional): Faction standings keyed by faction ID
        db: Database session

    Returns:
        Dict with:
            - reputation_band (str): Computed reputation band
            - reputation_score (float): Numeric reputation value
            - subject_id (int): Echo of input
            - target_id (int, optional): Echo of input
            - target_type (str, optional): Echo of input

    Raises:
        ValueError: If required fields missing or world not found
    """
    # Validate payload
    if "subject_id" not in payload:
        raise ValueError("Missing required field: subject_id")
    if "subject_type" not in payload:
        raise ValueError("Missing required field: subject_type")

    subject_id = int(payload["subject_id"])
    subject_type = payload["subject_type"]
    target_id = payload.get("target_id")
    target_type = payload.get("target_type")
    session_id = payload.get("session_id")

    # Validate subject_type
    if subject_type not in ["player", "npc"]:
        raise ValueError(f"Invalid subject_type: {subject_type}. Must be 'player' or 'npc'")

    # Validate target_type if provided
    if target_type and target_type not in ["npc", "faction", "group"]:
        raise ValueError(f"Invalid target_type: {target_type}. Must be 'npc', 'faction', or 'group'")

    # Load world and reputation schema
    result = await db.execute(
        select(GameWorld).where(GameWorld.id == world_id)
    )
    world = result.scalar_one_or_none()

    if not world:
        raise ValueError(f"World not found: {world_id}")

    # Extract reputation schema from world meta
    reputation_schema = None
    if world.meta:
        reputation_schemas = world.meta.get("reputation_schemas", {})
        # Use target-type-specific schema if available, otherwise use default
        if target_type and target_type in reputation_schemas:
            reputation_schema = reputation_schemas[target_type]
        else:
            reputation_schema = reputation_schemas.get("default")

    # Get reputation score (from payload override, session, or default)
    reputation_score: Optional[float] = payload.get("reputation_score")

    # If no explicit score provided, try to derive from session relationships
    if reputation_score is None and session_id and target_id and target_type == "npc":
        # Try to load from session relationships
        session_result = await db.execute(
            select(GameSession).where(GameSession.id == session_id)
        )
        session = session_result.scalar_one_or_none()

        if session and session.relationships:
            # Look for relationship data
            if subject_type == "player":
                # Player-to-NPC relationship
                npc_key = f"npc:{target_id}"
                npc_rel = session.relationships.get(npc_key, {})
                # Use affinity as reputation score
                reputation_score = npc_rel.get("affinity", 50.0)
            elif subject_type == "npc":
                # NPC-to-NPC relationship
                pair_key = f"npcPair:{subject_id}:{target_id}"
                pair_rel = session.relationships.get(pair_key, {})
                # Use friendship or rivalry (convert to 0-100 scale)
                friendship = pair_rel.get("friendship", 0.5)
                reputation_score = friendship * 100

    # Handle faction-based reputation
    if reputation_score is None and target_type == "faction":
        faction_membership = payload.get("faction_membership", {})
        if target_id and str(target_id) in faction_membership:
            reputation_score = faction_membership[str(target_id)]

    # Use neutral default if still no score
    if reputation_score is None:
        reputation_score = 50.0  # Neutral default

    # Clamp to 0-100 range
    reputation_score = max(0.0, min(100.0, reputation_score))

    # Compute reputation band using schema
    reputation_band = _compute_reputation_from_schema(reputation_score, reputation_schema)

    # Build result
    result_dict: dict[str, Any] = {
        "reputation_band": reputation_band,
        "reputation_score": reputation_score,
        "subject_id": subject_id,
    }

    if target_id is not None:
        result_dict["target_id"] = target_id
    if target_type:
        result_dict["target_type"] = target_type

    return result_dict
