"""Fire-and-forget service for recording account lifecycle events.

Writes are non-blocking and go through :class:`SatelliteTableHandler`.
If the handler is not initialized (no DB URL), calls are silently dropped.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Column, Integer, String, DateTime, JSON

from pixsim_logging.satellite_handler import SatelliteTableHandler, create_satellite_handler_from_env


_ACCOUNT_EVENTS_COLUMNS = [
    Column("timestamp", DateTime(timezone=True), nullable=False),
    Column("event_type", String(50), nullable=False),
    Column("account_id", Integer, nullable=False),
    Column("provider_id", String(50)),
    Column("generation_id", Integer),
    Column("job_id", Integer),
    Column("cooldown_seconds", Integer),
    Column("credit_type", String(30)),
    Column("credit_amount", Integer),
    Column("previous_status", String(30)),
    Column("error_code", String(100)),
    Column("attempt", Integer),
    Column("extra", JSON),
    Column("created_at", DateTime(timezone=True)),
]


class AccountEventService:
    """Singleton service for recording account events."""

    _handler: SatelliteTableHandler | None = None

    @classmethod
    def initialize(cls) -> None:
        """Create the satellite handler from env. Safe to call multiple times."""
        if cls._handler is not None:
            return
        cls._handler = create_satellite_handler_from_env(
            table_name="account_events",
            columns=_ACCOUNT_EVENTS_COLUMNS,
        )

    @classmethod
    def record(
        cls,
        event_type: str,
        account_id: int,
        *,
        provider_id: Optional[str] = None,
        generation_id: Optional[int] = None,
        job_id: Optional[int] = None,
        cooldown_seconds: Optional[int] = None,
        credit_type: Optional[str] = None,
        credit_amount: Optional[int] = None,
        previous_status: Optional[str] = None,
        error_code: Optional[str] = None,
        attempt: Optional[int] = None,
        extra: Optional[dict[str, Any]] = None,
    ) -> None:
        """Record an account event (fire-and-forget, non-blocking)."""
        if cls._handler is None:
            return
        now = datetime.now(timezone.utc)
        row: dict[str, Any] = {
            "timestamp": now,
            "event_type": event_type,
            "account_id": account_id,
            "created_at": now,
        }
        if provider_id is not None:
            row["provider_id"] = provider_id
        if generation_id is not None:
            row["generation_id"] = generation_id
        if job_id is not None:
            row["job_id"] = job_id
        if cooldown_seconds is not None:
            row["cooldown_seconds"] = cooldown_seconds
        if credit_type is not None:
            row["credit_type"] = credit_type
        if credit_amount is not None:
            row["credit_amount"] = credit_amount
        if previous_status is not None:
            row["previous_status"] = previous_status
        if error_code is not None:
            row["error_code"] = error_code
        if attempt is not None:
            row["attempt"] = attempt
        if extra is not None:
            row["extra"] = extra
        cls._handler.write(row)

    @classmethod
    def shutdown(cls) -> None:
        if cls._handler is not None:
            cls._handler.shutdown()
            cls._handler = None
