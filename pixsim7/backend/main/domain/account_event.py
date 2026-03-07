"""AccountEvent domain model for the account_events satellite table.

Used for API serialization and Alembic metadata registration.
Writes go through :class:`SatelliteTableHandler` (not ORM).
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel, Column, JSON
from sqlalchemy import DateTime, Index, text


class AccountEventType(str, Enum):
    selected = "selected"
    released = "released"
    cooldown_applied = "cooldown_applied"
    cooldown_expired = "cooldown_expired"
    credits_refreshed = "credits_refreshed"
    credits_exhausted = "credits_exhausted"
    auth_failure = "auth_failure"
    reactivated = "reactivated"
    marked_exhausted = "marked_exhausted"
    all_exhausted = "all_exhausted"
    no_credits = "no_credits"


class AccountEvent(SQLModel, table=True):
    """Structured account lifecycle event."""

    __tablename__ = "account_events"

    # No auto-increment PK — TimescaleDB hypertable uses timestamp as partition key.
    # SQLModel requires a primary key field; we mark timestamp as the PK here
    # even though the actual table has no PK constraint (hypertable pattern).
    timestamp: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, primary_key=True),
    )
    event_type: str = Field(max_length=50)
    account_id: int = Field()
    provider_id: Optional[str] = Field(default=None, max_length=50)
    generation_id: Optional[int] = Field(default=None)
    job_id: Optional[int] = Field(default=None)
    cooldown_seconds: Optional[int] = Field(default=None)
    credit_type: Optional[str] = Field(default=None, max_length=30)
    credit_amount: Optional[int] = Field(default=None)
    previous_status: Optional[str] = Field(default=None, max_length=30)
    error_code: Optional[str] = Field(default=None, max_length=100)
    attempt: Optional[int] = Field(default=None)
    extra: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("now()")),
    )

    __table_args__ = (
        Index("idx_account_events_account_timestamp", "account_id", "timestamp"),
        Index("idx_account_events_event_type_timestamp", "event_type", "timestamp"),
        Index("idx_account_events_provider_timestamp", "provider_id", "timestamp"),
    )
