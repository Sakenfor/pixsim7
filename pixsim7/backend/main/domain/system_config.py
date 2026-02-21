"""
SystemConfig domain model for persisting namespaced configuration blobs.

Each row stores a JSON payload for a given namespace (e.g. "generation").
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel, JSON, Column
from sqlalchemy import DateTime, String, text


class SystemConfig(SQLModel, table=True):
    """Namespaced system configuration stored as a JSON blob."""

    __tablename__ = "system_config"

    namespace: str = Field(
        sa_column=Column(String(100), primary_key=True),
        description="Config namespace, e.g. 'generation'",
    )
    data: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
        description="Configuration payload",
    )
    updated_by: Optional[int] = Field(
        default=None,
        foreign_key="users.id",
        description="User who last modified this config",
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True),
            server_default=text("now()"),
            nullable=True,
        ),
        description="When the config was last modified",
    )
