from __future__ import annotations

"""
Pydantic models for validating world-level relationship/intimacy schemas.

These models intentionally cover only the schema-related portions of
GameWorld.meta and ignore any unrelated fields (UI config, generation, etc.).
"""

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class RelationshipTierSchema(BaseModel):
    """
    Schema entry for a single relationship tier.

    Example:
    {
        "id": "friend",
        "min": 40,
        "max": 69
    }
    """

    id: str
    min: float
    max: Optional[float] = None


class IntimacyLevelSchema(BaseModel):
    """
    Schema entry for a single intimacy level.

    Example (stored under GameWorld.meta.intimacy_schema.levels):
    {
        "id": "light_flirt",
        "minAffinity": 30,
        "minTrust": 20,
        "minChemistry": 30,
        "maxTension": 40
    }
    """

    id: str
    minAffinity: Optional[float] = None
    minTrust: Optional[float] = None
    minChemistry: Optional[float] = None
    maxTension: Optional[float] = None


class IntimacySchema(BaseModel):
    """
    Container for intimacy level schemas.

    Matches the structure:
    GameWorld.meta.intimacy_schema = { "levels": [IntimacyLevelSchema, ...] }
    """

    levels: List[IntimacyLevelSchema] = Field(default_factory=list)


class WorldMetaSchemas(BaseModel):
    """
    World-level relationship and intimacy schemas inside GameWorld.meta.

    Only validates known fields and ignores any extra keys so that other
    systems (UI config, generation config, etc.) can evolve independently.
    """

    relationship_schemas: Dict[str, List[RelationshipTierSchema]] = Field(
        default_factory=dict
    )
    intimacy_schema: Optional[IntimacySchema] = None

    class Config:
        extra = "ignore"

