"""
Plugin catalog API schemas

Request/response models for plugin management endpoints.

This module defines the canonical schema for plugin metadata that is shared
between frontend and backend. The frontend has a corresponding
`UnifiedPluginDescriptor` type in `apps/main/src/lib/plugins/types.ts`.
"""
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


# ===== RESPONSE MODELS =====

class SceneViewMetadata(BaseModel):
    """Scene view plugin metadata"""
    scene_view_id: str = Field(description="Scene view identifier")
    surfaces: list[str] = Field(default_factory=list, description="Supported surfaces: overlay, hud, panel, workspace")
    default: bool = Field(default=False, description="Is this the default scene view")


class ControlCenterMetadata(BaseModel):
    """Control center plugin metadata"""
    control_center_id: str = Field(description="Control center identifier")
    display_name: Optional[str] = Field(default=None, description="Display name")
    features: list[str] = Field(default_factory=list, description="Feature list")
    preview: Optional[str] = Field(default=None, description="Preview image URL")
    default: bool = Field(default=False, description="Is this the default control center")


class PluginMetadata(BaseModel):
    """
    Extended plugin metadata from manifest

    This schema supports family-specific metadata:
    - scene: uses scene_view field
    - control-center: uses control_center field
    - ui/tool: uses permissions, surfaces
    """
    # Common fields
    permissions: list[str] = Field(default_factory=list, description="Required permissions")

    # Scene view specific (family='scene')
    surfaces: list[str] = Field(default_factory=list, description="Supported surfaces for scene views")
    default: bool = Field(default=False, description="Is this the default plugin for its family")

    # Family-specific nested metadata (optional)
    scene_view: Optional[SceneViewMetadata] = Field(default=None, description="Scene view specific metadata")
    control_center: Optional[ControlCenterMetadata] = Field(default=None, description="Control center specific metadata")


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
