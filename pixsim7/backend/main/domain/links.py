"""Generic Template↔Runtime Link Domain Models

This module provides generic link infrastructure for connecting any template entity
(CharacterInstance, ItemTemplate, PropTemplate) to any runtime entity (NPC, Item, Prop).

The link pattern supports:
- Bidirectional sync with field-level authority
- Priority-based conflict resolution
- Context-based activation (e.g., location, time)
- Mapping configuration via registry
- Extensible metadata

Architecture:
    Template Entity (characterInstance, itemTemplate, etc.)
      └─ ObjectLink
           └─ Runtime Entity (npc, item, etc.)

Example links:
- characterInstance->npc: CharacterInstance ↔ GameNPC
- itemTemplate->item: ItemTemplate ↔ GameItem
- propTemplate->prop: PropTemplate ↔ PropInstance
"""
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID, uuid4
from sqlmodel import SQLModel, Field, Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import Index

from pixsim7.backend.main.shared.datetime_utils import utcnow


class ObjectLink(SQLModel, table=True):
    """Generic template↔runtime link table

    Links a template entity (design/definition) to a runtime entity (in-game instance)
    with configurable sync behavior, priority, and activation conditions.

    Mapping ID format: "templateKind->runtimeKind" (e.g., "characterInstance->npc")

    Example:
        from pixsim7.backend.main.services.links.link_types import link_type_id

        ObjectLink(
            template_kind='characterInstance',
            template_id='abc-123-uuid',
            runtime_kind='npc',
            runtime_id=456,
            mapping_id=link_type_id('characterInstance', 'npc'),
            priority=10,
            activation_conditions={'location.zone': 'downtown'}
        )
    """
    __tablename__ = "object_links"

    # Primary key
    link_id: UUID = Field(default_factory=uuid4, primary_key=True)

    # Template reference
    template_kind: str = Field(
        max_length=50,
        description="Template entity kind (e.g., 'characterInstance', 'itemTemplate')"
    )
    template_id: str = Field(
        max_length=255,
        description="Template entity ID (usually UUID)"
    )

    # Runtime reference
    runtime_kind: str = Field(
        max_length=50,
        description="Runtime entity kind (e.g., 'npc', 'item', 'prop')"
    )
    runtime_id: int = Field(
        description="Runtime entity ID (usually integer)"
    )

    # Sync configuration
    sync_enabled: bool = Field(
        default=True,
        description="Enable/disable sync for this link"
    )
    sync_direction: str = Field(
        default='bidirectional',
        max_length=50,
        description="Sync direction: 'bidirectional', 'template_to_runtime', 'runtime_to_template'"
    )

    # Mapping reference
    mapping_id: Optional[str] = Field(
        None,
        max_length=100,
        description="Mapping ID pointing to FieldMapping config (e.g., 'characterInstance->npc')"
    )

    # Per-link sync field mappings (simple path-to-path map for sync operations)
    # Format: {"source.path": "target.path"} e.g., {"visual_traits.scars": "personality.appearance.scars"}
    # This is for sync services, NOT for overriding FieldMapping registry configs
    sync_field_mappings: Optional[Dict[str, str]] = Field(
        None,
        sa_column=Column(JSONB),
        description="Per-link field mappings for sync operations (source_path -> target_path)"
    )

    # Link behavior
    priority: int = Field(
        default=0,
        description="Priority for conflict resolution (higher priority wins)"
    )
    activation_conditions: Optional[Dict[str, Any]] = Field(
        None,
        sa_column=Column(JSONB),
        description="Context-based activation conditions (e.g., {'location.zone': 'downtown'})"
    )

    # Metadata
    meta: Optional[Dict[str, Any]] = Field(
        None,
        sa_column=Column(JSONB),
        description="Extensible metadata for domain-specific use"
    )
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    last_synced_at: Optional[datetime] = Field(None)
    last_sync_direction: Optional[str] = Field(None, max_length=50)

    # Table args for indexes
    __table_args__ = (
        Index('ix_object_links_template', 'template_kind', 'template_id'),
        Index('ix_object_links_runtime', 'runtime_kind', 'runtime_id'),
        Index('ix_object_links_mapping_id', 'mapping_id'),
        Index('ix_object_links_priority', 'runtime_kind', 'runtime_id', 'priority'),
    )

    class Config:
        arbitrary_types_allowed = True

    def __repr__(self) -> str:
        return (
            f"ObjectLink("
            f"{self.template_kind}:{self.template_id} -> "
            f"{self.runtime_kind}:{self.runtime_id}, "
            f"mapping={self.mapping_id}, "
            f"priority={self.priority})"
        )
