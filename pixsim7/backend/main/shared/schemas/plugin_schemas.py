"""
Plugin catalog API schemas

Request/response models for plugin management endpoints.
"""
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


# ===== RESPONSE MODELS =====

class PluginMetadata(BaseModel):
    """Plugin metadata from manifest"""
    permissions: list[str] = Field(default_factory=list)
    surfaces: list[str] = Field(default_factory=list)
    default: bool = False


class PluginResponse(BaseModel):
    """Plugin catalog entry response"""
    plugin_id: str = Field(description="Unique plugin identifier")
    name: str = Field(description="Display name")
    description: Optional[str] = None
    version: str = Field(description="Semantic version")
    author: Optional[str] = None
    icon: Optional[str] = None

    # Classification
    family: str = Field(description="Plugin family (scene, ui, tool)")
    plugin_type: str = Field(description="Plugin type within family")
    tags: list[str] = Field(default_factory=list)

    # Bundle location
    bundle_url: str = Field(description="URL to plugin bundle")
    manifest_url: Optional[str] = None

    # State
    is_builtin: bool = Field(description="Built-in plugin")
    is_enabled: bool = Field(description="Enabled for current user")

    # Metadata
    metadata: PluginMetadata = Field(default_factory=PluginMetadata)

    class Config:
        from_attributes = True


class PluginListResponse(BaseModel):
    """List of plugins response"""
    plugins: list[PluginResponse]
    total: int


class PluginStateResponse(BaseModel):
    """Response after enabling/disabling a plugin"""
    plugin_id: str
    is_enabled: bool
    message: str


# ===== REQUEST MODELS =====

class PluginSettingsUpdate(BaseModel):
    """Update plugin-specific settings"""
    settings: dict = Field(default_factory=dict)


class PluginCreateRequest(BaseModel):
    """Create a new plugin catalog entry (admin only)"""
    plugin_id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    version: str = Field(default="1.0.0", max_length=20)
    author: Optional[str] = None
    icon: Optional[str] = None

    family: str = Field(min_length=1, max_length=50)
    plugin_type: str = Field(default="ui-overlay", max_length=50)
    tags: list[str] = Field(default_factory=list)

    bundle_url: str = Field(min_length=1, max_length=500)
    manifest_url: Optional[str] = None

    is_builtin: bool = False
    metadata: dict = Field(default_factory=dict)
