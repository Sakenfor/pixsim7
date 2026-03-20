from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID, uuid4

from sqlalchemy import JSON, Text
from sqlmodel import Column, Field, Index, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow

PLATFORM_SCHEMA = "dev_meta"


class EntityAudit(SQLModel, table=True):
    """Generic mutation audit entry for any domain entity."""

    __tablename__ = "entity_audit"
    __table_args__ = (
        Index("idx_entity_audit_domain_ts", "domain", "timestamp"),
        Index("idx_entity_audit_entity", "entity_type", "entity_id", "timestamp"),
        Index("idx_entity_audit_actor_ts", "actor", "timestamp"),
        {"schema": PLATFORM_SCHEMA},
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    domain: str = Field(max_length=32)  # plan, prompt, game, asset, registry
    entity_type: str = Field(max_length=64)  # plan_registry, prompt_family, scene, npc, ...
    entity_id: str = Field(max_length=120, index=True)
    entity_label: Optional[str] = Field(default=None, max_length=255)
    action: str = Field(max_length=32)  # created, updated, deleted, field_changed, status_changed, content_updated
    field: Optional[str] = Field(default=None, max_length=64)
    old_value: Optional[str] = Field(default=None, sa_column=Column(Text))
    new_value: Optional[str] = Field(default=None, sa_column=Column(Text))
    actor: str = Field(max_length=120)  # user:1, agent:codex-cli, system
    commit_sha: Optional[str] = Field(default=None, max_length=64)
    extra: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column("metadata", JSON))
    timestamp: datetime = Field(default_factory=utcnow, index=True)
