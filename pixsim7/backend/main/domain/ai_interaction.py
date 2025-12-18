"""
AI Interaction domain model - tracks LLM operations for prompt editing

Purpose:
    Record all AI-assisted prompt edits for audit, analysis, and debugging.
    Captures the input prompt, output prompt, model used, and optional linkage
    to a generation record.

Design:
    - Immutable: All fields are set at creation
    - Linkage: Optional foreign key to generation for context
    - Audit trail: Full input/output with timestamps
"""
from typing import Optional
from datetime import datetime
from pydantic import ConfigDict
from sqlmodel import SQLModel, Field, Index


class AiInteraction(SQLModel, table=True):
    """
    AI Interaction record for LLM operations

    Tracks:
        - Prompt editing operations
        - Model and provider used
        - Input and output prompts
        - Optional linkage to generation
    """
    # Allow fields like model_id without Pydantic protected namespace warnings.
    model_config = ConfigDict(protected_namespaces=())
    __tablename__ = "ai_interactions"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # User who initiated the interaction
    user_id: int = Field(
        foreign_key="users.id",
        index=True,
        description="User who requested the AI operation"
    )

    # Optional linkage to a generation
    # Allows tracking which AI edits were used for which generations
    generation_id: Optional[int] = Field(
        default=None,
        foreign_key="generations.id",
        index=True,
        description="Optional generation this interaction is linked to"
    )

    # Provider and model used
    provider_id: str = Field(
        max_length=50,
        index=True,
        description="LLM provider ID (e.g., 'openai-llm', 'anthropic-llm')"
    )

    model_id: str = Field(
        max_length=100,
        description="Model used (e.g., 'gpt-4', 'claude-sonnet-4')"
    )

    # Prompt data (immutable)
    prompt_before: str = Field(
        description="Original prompt before AI editing"
    )

    prompt_after: str = Field(
        description="AI-edited prompt"
    )

    # Timestamp
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="When this interaction occurred"
    )

    # Indexes for common queries
    __table_args__ = (
        Index("ix_ai_interactions_user_created", "user_id", "created_at"),
        Index("ix_ai_interactions_provider_created", "provider_id", "created_at"),
    )

    def __repr__(self):
        return (
            f"<AiInteraction("
            f"id={self.id}, "
            f"user_id={self.user_id}, "
            f"provider={self.provider_id}, "
            f"model={self.model_id})>"
        )
