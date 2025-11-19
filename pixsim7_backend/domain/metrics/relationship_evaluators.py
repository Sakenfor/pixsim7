"""
Relationship metric evaluators for preview API.

These evaluators provide read-only relationship tier and intimacy level
computation using world-specific schemas.
"""

from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7_backend.domain.game.models import GameWorld
from pixsim7_backend.domain.narrative.relationships import (
    compute_relationship_tier,
    compute_intimacy_level,
)


async def evaluate_relationship_tier(
    world_id: int, payload: dict[str, Any], db: AsyncSession
) -> dict[str, Any]:
    """
    Evaluate relationship tier metric.

    Args:
        world_id: World ID for schema lookup
        payload: Must contain "affinity" (float), optionally "schema_key" (str)
        db: Database session

    Returns:
        Dict with:
            - tier_id: Computed tier ID (e.g., "friend", "lover") or None
            - schema_key: Schema that was used
            - affinity: Echo of input value

    Raises:
        ValueError: If required fields missing or world not found
    """
    # Validate payload
    if "affinity" not in payload:
        raise ValueError("Missing required field: affinity")

    affinity = float(payload["affinity"])
    schema_key = payload.get("schema_key", "default")

    # Load world and schemas
    result = await db.execute(select(GameWorld).where(GameWorld.id == world_id))
    world = result.scalar_one_or_none()

    if not world:
        raise ValueError(f"World not found: {world_id}")

    # Extract schemas from world meta
    relationship_schemas = (
        world.meta.get("relationship_schemas", {}) if world.meta else {}
    )

    # Compute tier using existing domain logic
    tier_id = compute_relationship_tier(affinity, relationship_schemas, schema_key)

    return {
        "tier_id": tier_id,
        "schema_key": schema_key,
        "affinity": affinity,
    }


async def evaluate_relationship_intimacy(
    world_id: int, payload: dict[str, Any], db: AsyncSession
) -> dict[str, Any]:
    """
    Evaluate relationship intimacy metric.

    Args:
        world_id: World ID for schema lookup
        payload: Must contain "relationship_values" dict with affinity/trust/chemistry/tension
        db: Database session

    Returns:
        Dict with:
            - intimacy_level_id: Computed intimacy level (e.g., "intimate") or None
            - relationship_values: Echo of input values

    Raises:
        ValueError: If required fields missing or world not found
    """
    # Validate payload
    if "relationship_values" not in payload:
        raise ValueError("Missing required field: relationship_values")

    rel_values = payload["relationship_values"]
    required_fields = ["affinity", "trust", "chemistry", "tension"]

    for field in required_fields:
        if field not in rel_values:
            raise ValueError(f"Missing required relationship value: {field}")

    relationship_values = {
        "affinity": float(rel_values["affinity"]),
        "trust": float(rel_values["trust"]),
        "chemistry": float(rel_values["chemistry"]),
        "tension": float(rel_values["tension"]),
    }

    # Load world and schemas
    result = await db.execute(select(GameWorld).where(GameWorld.id == world_id))
    world = result.scalar_one_or_none()

    if not world:
        raise ValueError(f"World not found: {world_id}")

    # Extract intimacy schema
    intimacy_schema = world.meta.get("intimacy_schema") if world.meta else None

    # Compute intimacy level using existing domain logic
    intimacy_level_id = compute_intimacy_level(relationship_values, intimacy_schema)

    return {
        "intimacy_level_id": intimacy_level_id,
        "relationship_values": relationship_values,
    }
