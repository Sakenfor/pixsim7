"""
Provider schemas - shared types for provider plugins

This module defines the shared schemas used by both video and LLM provider plugins.
"""
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ProviderKind(str, Enum):
    """Provider kind/capability type"""
    VIDEO = "video"
    LLM = "llm"
    BOTH = "both"


class ProviderManifest(BaseModel):
    """Manifest for provider plugins

    Defines all static metadata for a provider plugin. This includes:
    - Identity: id, name, version, author
    - Capabilities: kind, requires_credentials
    - Domain configuration: domains (for URL detection and UI display)
    - Credit types: credit_types (for billing/credit tracking)

    Example:
        manifest = ProviderManifest(
            id="pixverse",
            name="Pixverse AI",
            version="1.0.0",
            description="Video generation provider",
            author="PixSim Team",
            kind=ProviderKind.VIDEO,
            domains=["pixverse.ai", "app.pixverse.ai"],
            credit_types=["web", "openapi"],
        )
    """
    id: str
    name: str
    version: str
    description: str
    author: str
    kind: ProviderKind  # Distinguish between video/LLM providers
    enabled: bool = True
    requires_credentials: bool = True

    # Domain metadata for URL detection and UI
    domains: list[str] = Field(
        default_factory=list,
        description="List of domains associated with this provider (e.g., ['pixverse.ai', 'app.pixverse.ai'])"
    )

    # Credit types supported by this provider (for billing)
    credit_types: list[str] = Field(
        default_factory=lambda: ["web"],
        description="Credit types this provider supports (e.g., ['web', 'openapi', 'standard'])"
    )

    # Optional: Status mapping documentation for developers
    status_mapping_notes: Optional[str] = Field(
        default=None,
        description="Notes on how provider status codes map to ProviderStatus enum"
    )
