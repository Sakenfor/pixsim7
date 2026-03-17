"""
Assistant Definition domain model.

Stores AI assistant profile definitions. Each profile configures
how the assistant behaves: persona, model, delivery method, and tool scope.

Follows the same pattern as AnalyzerDefinition.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON

from pixsim7.backend.main.shared.datetime_utils import utcnow


class AssistantDefinition(SQLModel, table=True):
    """
    AI assistant profile definition.

    Each profile bundles:
    - Persona (system prompt override)
    - Model + delivery method preferences
    - Tool scope (which contracts/capabilities are available)
    - Icon for UI display

    Users can create multiple profiles and switch between them in the
    AI Assistant panel. Profiles can inherit from a base definition.
    """
    __tablename__ = "assistant_definitions"

    id: Optional[int] = Field(default=None, primary_key=True)

    assistant_id: str = Field(
        unique=True,
        index=True,
        max_length=100,
        description="Canonical assistant ID (e.g., 'assistant:code-helper')",
    )
    base_assistant_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Optional base assistant to inherit config from",
    )

    name: str = Field(max_length=255, description="Display name (e.g., 'Code Helper')")
    description: Optional[str] = Field(default=None, description="Short description")
    icon: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Icon name or emoji for UI display",
    )

    # LLM configuration
    model_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Preferred model (e.g., 'anthropic:claude-3.5'). Null = use global default.",
    )
    method: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Delivery method: 'api', 'remote', 'cmd', 'local'. Null = use model default.",
    )

    # Persona
    system_prompt: Optional[str] = Field(
        default=None,
        description="System prompt override. Appended to the base system prompt.",
    )

    # Tool scope
    audience: str = Field(
        default="user",
        max_length=20,
        description="Contract audience filter: 'user' or 'dev'.",
    )
    allowed_contracts: list = Field(
        default_factory=list,
        sa_column=Column(JSON, default=list),
        description="Explicit contract IDs this assistant can access. Empty = all for audience.",
    )

    # Extra config (future extensibility)
    config: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Additional configuration (temperature, max_tokens, etc.)",
    )

    # Ownership
    owner_user_id: Optional[int] = Field(
        default=None,
        foreign_key="users.id",
        index=True,
        description="Owner user ID (null = system/global profile)",
    )

    enabled: bool = Field(default=True, index=True)
    is_default: bool = Field(default=False, index=True)
    version: int = Field(default=1)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    def __repr__(self) -> str:
        return f"<AssistantDefinition(id={self.id}, assistant_id='{self.assistant_id}')>"
