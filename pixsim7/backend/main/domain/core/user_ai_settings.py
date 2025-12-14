"""
User AI Provider Settings Model

Stores per-user AI provider configuration (API keys, default models)
"""
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel, Column, String
from sqlalchemy import DateTime, func


class UserAISettings(SQLModel, table=True):
    """User-specific AI provider configuration"""
    __tablename__ = "user_ai_settings"

    user_id: int = Field(foreign_key="users.id", primary_key=True)

    # API Keys (encrypted in production)
    openai_api_key: Optional[str] = Field(default=None, max_length=500)
    anthropic_api_key: Optional[str] = Field(default=None, max_length=500)

    # Provider preferences
    llm_provider: str = Field(default="anthropic", max_length=50)
    llm_default_model: Optional[str] = Field(default=None, max_length=100)

    # Timestamps
    created_at: datetime = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )
    updated_at: datetime = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    )
