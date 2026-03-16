from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Text
from sqlmodel import Column, Field, Index, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow

PLATFORM_SCHEMA = "dev_meta"


class Notification(SQLModel, table=True):
    """Lightweight broadcast/targeted notification."""

    __tablename__ = "notifications"
    __table_args__ = (
        Index("idx_notifications_user_read", "user_id", "read"),
        {"schema": PLATFORM_SCHEMA},
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    title: str = Field(max_length=255)
    body: Optional[str] = Field(default=None, sa_column=Column(Text))
    category: str = Field(default="system", max_length=32)  # plan | feature | system | agent
    severity: str = Field(default="info", max_length=16)  # info | success | warning | error
    source: str = Field(default="system", max_length=120)  # user:{id} | agent:{session} | system
    ref_type: Optional[str] = Field(default=None, max_length=32)  # plan | document | generation
    ref_id: Optional[str] = Field(default=None, max_length=120)
    broadcast: bool = Field(default=True)
    user_id: Optional[int] = Field(default=None, index=True)  # NULL = broadcast
    read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow, index=True)
