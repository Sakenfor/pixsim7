"""
Provider Manifest Schema

Single source of truth for provider static metadata.

Providers define their manifest in their plugin's manifest.py file.
The manifest is loaded during plugin discovery and attached to the provider instance.
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
    """
    Manifest for provider plugins

    Defines all static metadata for a provider plugin. This is the SINGLE SOURCE
    OF TRUTH for provider metadata - adapters should not duplicate this information.

    Fields:
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

    The manifest is loaded during plugin discovery and attached to the provider
    instance by the registry. Access via provider.get_manifest().
    """
    # Identity
    id: str = Field(..., description="Unique provider identifier (e.g., 'pixverse')")
    name: str = Field(..., description="Human-readable provider name (e.g., 'Pixverse AI')")
    version: str = Field(..., description="Provider plugin version (semver)")
    description: str = Field(..., description="Brief description of provider capabilities")
    author: str = Field(..., description="Plugin author/maintainer")

    # Capabilities
    kind: ProviderKind = Field(..., description="Provider type: video, llm, or both")
    enabled: bool = Field(default=True, description="Whether provider is enabled")
    requires_credentials: bool = Field(
        default=True,
        description="Whether provider requires account credentials"
    )

    # Domain metadata for URL detection and UI
    domains: list[str] = Field(
        default_factory=list,
        description=(
            "List of domains associated with this provider. "
            "Used for URL detection by the browser extension. "
            "Example: ['pixverse.ai', 'app.pixverse.ai']"
        )
    )

    # Credit types supported by this provider (for billing)
    credit_types: list[str] = Field(
        default_factory=lambda: ["web"],
        description=(
            "Credit types this provider supports. "
            "Only these keys are considered 'usable credits' for this provider. "
            "Example: ['web', 'openapi', 'standard']"
        )
    )

    # Optional: Cost estimation configuration (for frontend UI)
    cost_estimator: Optional[dict] = Field(
        default=None,
        description=(
            "Optional cost estimation config for frontend UI. "
            "Expected shape: {endpoint, method, payload_keys, required_keys, include_operation_type}."
        ),
    )

    # Optional: Status mapping documentation for developers
    status_mapping_notes: Optional[str] = Field(
        default=None,
        description=(
            "Notes on how provider status codes map to ProviderStatus enum. "
            "Useful for debugging and onboarding new developers."
        )
    )

    class Config:
        """Pydantic config"""
        frozen = False  # Allow modification during registration
        extra = "allow"  # Allow additional provider-specific fields
