from __future__ import annotations

"""
Metric Definition Schemas

Schemas for defining and registering custom metrics.
"""

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field, field_validator

class MetricDefinitionSchema(BaseModel):
    """
    Metric definition schema for the metric registry.
    Defines how to find and interpret a metric value.
    """

    id: str = Field(description="Metric ID (e.g., 'npcRelationship.affinity')")
    type: str = Field(description="Metric type: float, int, enum, boolean")
    min: Optional[float] = Field(None, description="Minimum value (for numeric types)")
    max: Optional[float] = Field(None, description="Maximum value (for numeric types)")
    values: Optional[List[str]] = Field(None, description="Allowed values (for enum types)")
    component: str = Field(description="Component where this metric lives")
    path: Optional[str] = Field(None, description="Path within component (dot notation)")
    source: Optional[str] = Field(None, description="Source plugin ID")
    label: Optional[str] = Field(None, description="Human-readable label")
    description: Optional[str] = Field(None, description="Description")

    @field_validator('type')
    @classmethod
    def validate_type(cls, v: str) -> str:
        """Ensure type is one of the allowed values."""
        allowed_types = {'float', 'int', 'enum', 'boolean'}
        if v not in allowed_types:
            raise ValueError(f'type must be one of {allowed_types}')
        return v

    class Config:
        extra = "allow"


class MetricRegistrySchema(BaseModel):
    """
    Metric registry configuration schema.
    Stored in GameWorld.meta.metrics
    """

    npcRelationship: Optional[Dict[str, MetricDefinitionSchema]] = Field(None, description="NPC relationship metrics")
    npcBehavior: Optional[Dict[str, MetricDefinitionSchema]] = Field(None, description="NPC behavior metrics")
    playerState: Optional[Dict[str, MetricDefinitionSchema]] = Field(None, description="Player state metrics")
    worldState: Optional[Dict[str, MetricDefinitionSchema]] = Field(None, description="World state metrics")

    class Config:
        extra = "allow"  # Allow custom metric categories


# ===================
# Game State / Mode Schemas (Task 22)
# ===================
