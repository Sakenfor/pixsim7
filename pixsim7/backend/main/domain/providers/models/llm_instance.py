"""
LLM Provider Instance model - configurable provider profiles

Allows multiple named configurations per LLM provider type.
For example, multiple cmd-llm instances pointing to different backends
(Claude CLI, Ollama, Codex, etc.)
"""
from datetime import datetime
from typing import Optional, Dict, Any
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, DateTime, func


class LlmProviderInstance(SQLModel, table=True):
    """
    A named configuration instance for an LLM provider.

    Instances allow:
    - Multiple configurations per provider type (e.g., different cmd-llm backends)
    - Per-instance settings (command, API keys, base URLs, etc.)
    - Model binding (AI models can target specific instances)

    Examples:
        - "Claude CLI" (cmd-llm) -> command: "claude", args: ["--format", "json"]
        - "Local Ollama" (cmd-llm) -> command: "ollama", args: ["run", "llama2"]
        - "Azure OpenAI" (openai-llm) -> base_url: "https://mycompany.openai.azure.com"
    """
    __tablename__ = "llm_provider_instances"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Provider this instance belongs to (e.g., "cmd-llm", "openai-llm")
    provider_id: str = Field(
        max_length=50,
        index=True,
        description="Provider ID this instance configures"
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
    # For cmd-llm: {"command": "...", "args": [...], "timeout": 60}
    # For openai-llm: {"base_url": "...", "api_key": "..."}
    # For anthropic-llm: {"api_key": "..."}
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
            f"<LlmProviderInstance("
            f"id={self.id}, "
            f"provider_id={self.provider_id}, "
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
