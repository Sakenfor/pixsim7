"""
Provider Instance Config model - shared configuration profiles for providers.

This is a generic base for provider configuration instances, with kind
scoping (LLM, analyzer, etc.) so multiple instance types can share a table.
"""
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any

from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, DateTime, func

from pixsim7.backend.main.domain.enums import enum_column


class ProviderInstanceConfigKind(str, Enum):
    """Kinds of provider instance configs supported by the system."""
    LLM = "llm"
    ANALYZER = "analyzer"


class ProviderInstanceConfig(SQLModel, table=True):
    """
    Named configuration instance for a provider.

    Instances allow:
    - Multiple configurations per provider type
    - Per-instance settings (API keys, base URLs, params, etc.)
    - Scoped ownership (global vs per-user)
    """
    __tablename__ = "provider_instance_configs"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Kind of instance (e.g., llm, analyzer)
    kind: ProviderInstanceConfigKind = Field(
        sa_column=enum_column(
            ProviderInstanceConfigKind,
            "provider_instance_config_kind",
            index=True,
        )
    )

    # Provider this instance configures (e.g., "cmd-llm", "openai-llm")
    provider_id: str = Field(
        max_length=50,
        index=True,
        description="Provider ID this instance configures"
    )

    # Analyzer-specific binding (optional)
    analyzer_id: Optional[str] = Field(
        default=None,
        max_length=100,
        index=True,
        description="Analyzer ID this instance targets (for analyzer kind)"
    )

    # Optional model override (shared across kinds)
    model_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Model identifier override"
    )

    # Optional ownership (null = global/system)
    owner_user_id: Optional[int] = Field(
        default=None,
        foreign_key="users.id",
        index=True,
        description="Owner user ID (null = global instance)"
    )

    # Human-readable label for this instance
    label: str = Field(
        max_length=100,
        description="Display name (e.g., 'Claude CLI', 'Local Ollama')"
    )

    # Optional description
    description: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Optional description of this instance"
    )

    # Provider-specific configuration (JSON blob)
    config: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
        description="Provider-specific configuration"
    )

    # Whether this instance is enabled and selectable
    enabled: bool = Field(
        default=True,
        index=True,
        description="Whether this instance is active"
    )

    # Priority for sorting in UI (higher = shown first)
    priority: int = Field(
        default=0,
        description="Display priority (higher = first)"
    )

    # Timestamps
    created_at: datetime = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            nullable=False
        )
    )
    updated_at: datetime = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False
        )
    )

    def __repr__(self) -> str:
        return (
            f"<ProviderInstanceConfig("
            f"id={self.id}, "
            f"kind={self.kind.value}, "
            f"provider_id={self.provider_id}, "
            f"analyzer_id={self.analyzer_id}, "
            f"label={self.label}, "
            f"enabled={self.enabled})>"
        )

    def get_config_value(self, key: str, default: Any = None) -> Any:
        """Get a configuration value with optional default."""
        return self.config.get(key, default)

    def get_command_config(self) -> tuple[str | None, list[str], int]:
        """
        Get command configuration for cmd-llm instances.

        Returns:
            Tuple of (command, args, timeout)
        """
        return (
            self.config.get("command"),
            self.config.get("args", []),
            self.config.get("timeout", 60),
        )

    def get_api_key(self) -> str | None:
        """Get API key from config (for API-based providers)."""
        return self.config.get("api_key")

    def get_base_url(self) -> str | None:
        """Get base URL from config (for OpenAI-compatible providers)."""
        return self.config.get("base_url")
