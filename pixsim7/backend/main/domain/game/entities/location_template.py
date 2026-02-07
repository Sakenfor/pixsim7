"""
Location template registry for reusable location definitions.
"""

from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID, uuid4

from sqlmodel import SQLModel, Field, Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import Text

from ..stats import HasStatsWithMetadata
from pixsim7.backend.main.shared.datetime_utils import utcnow


class LocationTemplate(SQLModel, HasStatsWithMetadata, table=True):
    """Reusable location definition shared across worlds."""
    __tablename__ = "location_templates"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    location_id: str = Field(unique=True, index=True, max_length=200)
    name: Optional[str] = Field(None, max_length=200)
    display_name: Optional[str] = Field(None, max_length=200)
    location_type: Optional[str] = Field(None, max_length=100, index=True)
    description: Optional[str] = Field(None, sa_column=Column(Text))

    # Visual and spatial configuration
    default_asset_id: Optional[int] = Field(
        default=None,
        description="Default asset ID for 3D scene/environment",
    )
    default_spawn: Optional[str] = Field(
        None,
        max_length=128,
        description="Name of spawn point node in the 3D asset",
    )

    tags: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))
    template_metadata: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))

    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
