"""
Workspace domain model - project/folder organization

Workspaces group jobs, assets, and scenes into logical units
"""
from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON

from pixsim7.backend.main.shared.datetime_utils import utcnow


class Workspace(SQLModel, table=True):
    """
    Workspace model - organize jobs/assets into projects

    Use cases:
    - Video series: "Emma's Story - Season 1"
    - Client projects: "Client ABC - Marketing Videos"
    - Personal folders: "My Vacation Videos"

    Design principles:
    - Multi-user: Each user has their own workspaces
    - Flexible: Can contain jobs, assets, scenes
    - Shareable: (Phase 2) Can be shared with other users
    """
    __tablename__ = "workspaces"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Owner
    user_id: int = Field(foreign_key="users.id", index=True)

    # ===== METADATA =====
    name: str = Field(max_length=255)
    description: Optional[str] = None
    color: Optional[str] = Field(
        default=None,
        max_length=7,
        description="Hex color code (#FF5733)"
    )
    icon: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Icon name or emoji"
    )

    # ===== ORGANIZATION =====
    # Parent workspace for nested folders (Phase 2)
    parent_workspace_id: Optional[int] = Field(
        default=None,
        foreign_key="workspaces.id",
        index=True
    )

    # Tags for organization
    tags: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON)
    )

    # ===== STATE =====
    is_archived: bool = Field(
        default=False,
        index=True,
        description="Archived workspaces hidden by default"
    )
    is_template: bool = Field(
        default=False,
        description="Template workspace (reusable)"
    )

    # ===== SHARING (Phase 2) =====
    is_public: bool = Field(
        default=False,
        description="Public workspace (view-only)"
    )
    # TODO: Add workspace_members table for collaboration

    # ===== STATS =====
    total_jobs: int = Field(default=0)
    total_assets: int = Field(default=0)
    total_scenes: int = Field(default=0)

    # ===== SETTINGS =====
    settings: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Workspace-specific settings"
    )

    # ===== TIMESTAMPS =====
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    last_activity_at: Optional[datetime] = None

    def __repr__(self):
        return f"<Workspace(id={self.id}, name='{self.name}', user_id={self.user_id})>"
