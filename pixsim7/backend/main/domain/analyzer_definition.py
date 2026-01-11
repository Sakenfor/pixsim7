"""
Analyzer Definition domain model

Stores custom analyzer definitions created via API.
These are synced into the in-memory analyzer registry on startup.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON

from pixsim7.backend.main.shared.datetime_utils import utcnow


class AnalyzerDefinition(SQLModel, table=True):
    """
    Custom analyzer definition registered via API.

    Analyzer IDs should follow the convention:
    - prompt:<name> for prompt analyzers
    - asset:<name> for asset analyzers
    """
    __tablename__ = "analyzer_definitions"

    id: Optional[int] = Field(default=None, primary_key=True)

    analyzer_id: str = Field(
        unique=True,
        index=True,
        max_length=100,
        description="Canonical analyzer ID (e.g., 'prompt:custom-llm')",
    )
    base_analyzer_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Optional base analyzer to inherit config/presets from",
    )
    preset_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Optional preset ID to select from the base definition",
    )
    name: str = Field(max_length=255, description="Display name")
    description: Optional[str] = Field(default=None, description="Analyzer description")

    # Store enums as strings to avoid domain-layer coupling.
    kind: str = Field(max_length=20, index=True, description="Analyzer kind (parser/llm/vision)")
    target: str = Field(max_length=20, index=True, description="Analyzer target (prompt/asset)")

    provider_id: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Provider ID (required for LLM/Vision analyzers)",
    )
    model_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Default model ID for this analyzer",
    )

    config: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Analyzer-specific configuration defaults",
    )

    source_plugin_id: Optional[str] = Field(
        default="api",
        max_length=100,
        description="Source plugin ID or origin tag",
    )

    enabled: bool = Field(default=True, index=True, description="Whether this analyzer is enabled")
    is_default: bool = Field(default=False, index=True, description="Default analyzer for its target")
    is_legacy: bool = Field(default=False, description="Legacy alias entry")

    created_by_user_id: Optional[int] = Field(
        default=None,
        foreign_key="users.id",
        index=True,
        description="User who created this analyzer",
    )

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    def __repr__(self) -> str:
        return f"<AnalyzerDefinition(id={self.id}, analyzer_id='{self.analyzer_id}')>"
