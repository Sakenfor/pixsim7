"""
Plugin Catalog domain model - manages UI plugin bundles

Tracks available plugins, their enabled/disabled state per user or workspace.
This is a lightweight initial implementation - can be extended with:
- Per-workspace plugin settings
- Plugin versions and updates
- Plugin permissions and dependencies
"""
from typing import Optional
from datetime import datetime
from enum import Enum
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, UniqueConstraint
from pixsim7.backend.main.shared.datetime_utils import utcnow


class PluginFamily(str, Enum):
    """Plugin family types - matches frontend plugin families"""
    SCENE = "scene"
    UI = "ui"
    TOOL = "tool"
    PANEL = "panel"
    GRAPH = "graph"
    GAME = "game"
    SURFACE = "surface"
    GENERATION = "generation"
    CONTROL_CENTER = "control-center"


class PluginCatalogEntry(SQLModel, table=True):
    """
    Plugin catalog entry - available plugins in the system

    This table stores the master list of available plugins.
    Initially populated with built-in plugins, can be extended
    to support uploaded third-party plugins.
    """
    __tablename__ = "plugin_catalog"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # ===== IDENTITY =====
    plugin_id: str = Field(
        unique=True,
        index=True,
        max_length=100,
        description="Unique plugin identifier (e.g., 'scene-view:comic-panels')"
    )
    name: str = Field(max_length=255, description="Display name")
    description: Optional[str] = Field(default=None, description="Plugin description")
    version: str = Field(default="1.0.0", max_length=20, description="Semantic version")
    author: Optional[str] = Field(default=None, max_length=100)
    icon: Optional[str] = Field(default=None, max_length=50, description="Icon emoji or URL")

    # ===== CLASSIFICATION =====
    family: str = Field(
        index=True,
        max_length=50,
        description="Plugin family (scene, ui, tool, panel, graph, game, surface, generation)"
    )
    plugin_type: str = Field(
        default="ui-overlay",
        max_length=50,
        description="Plugin type within family"
    )
    tags: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Searchable tags"
    )

    # ===== BUNDLE LOCATION =====
    bundle_url: Optional[str] = Field(
        default=None,
        max_length=500,
        description="URL to plugin.js bundle (relative or absolute); null for source plugins"
    )
    manifest_url: Optional[str] = Field(
        default=None,
        max_length=500,
        description="URL to manifest.json (optional, for validation)"
    )

    # ===== STATE =====
    is_builtin: bool = Field(
        default=False,
        description="Built-in plugin (cannot be uninstalled)"
    )
    is_required: bool = Field(
        default=False,
        description="Required plugin that cannot be disabled"
    )
    is_available: bool = Field(
        default=True,
        index=True,
        description="Available for installation (false = deprecated)"
    )
    source: str = Field(
        default="bundle",
        max_length=50,
        description="Plugin source type (bundle, source, remote, frontend-sync)"
    )

    # ===== METADATA =====
    meta: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Additional plugin metadata (permissions, surfaces, etc.)"
    )

    # ===== TIMESTAMPS =====
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    def __repr__(self):
        return f"<PluginCatalogEntry(id={self.id}, plugin_id='{self.plugin_id}', family='{self.family}')>"


class UserPluginState(SQLModel, table=True):
    """
    User-specific plugin state - tracks enabled/disabled per user

    Each user can enable/disable plugins independently.
    Future: Can be extended to support workspace-level settings.
    """
    __tablename__ = "user_plugin_states"
    __table_args__ = (
        UniqueConstraint("user_id", "plugin_id", name="uq_user_plugin"),
    )

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # ===== RELATIONSHIPS =====
    user_id: int = Field(foreign_key="users.id", index=True)
    plugin_id: str = Field(
        index=True,
        max_length=100,
        description="References PluginCatalogEntry.plugin_id"
    )

    # Future: workspace-level settings
    workspace_id: Optional[int] = Field(
        default=None,
        foreign_key="workspaces.id",
        index=True,
        description="Optional workspace scope (null = user-level)"
    )

    # ===== STATE =====
    is_enabled: bool = Field(default=True, description="Plugin enabled for this user")

    # ===== USER SETTINGS =====
    settings: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="User-specific plugin settings"
    )

    # ===== TIMESTAMPS =====
    enabled_at: Optional[datetime] = Field(
        default=None,
        description="When plugin was last enabled"
    )
    disabled_at: Optional[datetime] = Field(
        default=None,
        description="When plugin was last disabled"
    )
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    def __repr__(self):
        return f"<UserPluginState(user_id={self.user_id}, plugin_id='{self.plugin_id}', enabled={self.is_enabled})>"
