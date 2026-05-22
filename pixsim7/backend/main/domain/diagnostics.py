"""DiagnosticRunRecord — persisted history of admin diagnostic runs.

The live run manager (``services/diagnostics/runs.py``) keeps active runs
in process memory for streaming; this table is the durable mirror so run
history survives a reload/restart and is visible from any client (the
in-memory store is single-process and wiped on the dev reloader's restart).

One row per run.  ``events`` holds the full typed-event stream as JSON,
written once when the run reaches a terminal state (per-event DB churn
isn't worth it for an admin surface).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, Text, text
from sqlmodel import JSON, Column, Field, SQLModel


class DiagnosticRunRecord(SQLModel, table=True):
    __tablename__ = "diagnostic_runs"

    run_id: str = Field(primary_key=True, max_length=64)
    diagnostic_id: str = Field(index=True, max_length=128, description="Diagnostic spec id")
    status: str = Field(max_length=20, description="running | completed | cancelled | errored")
    started_by: str = Field(max_length=64, description="Principal id that started the run")

    started_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True),
        description="UTC start time (run accepted).",
    )
    finished_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
        description="UTC terminal time; null while running.",
    )
    error: Optional[str] = Field(default=None, sa_column=Column(Text), description="Error message on errored runs")
    event_count: int = Field(default=0, description="Number of events captured")

    params: dict = Field(default_factory=dict, sa_column=Column(JSON), description="Coerced run params")
    events: list = Field(default_factory=list, sa_column=Column(JSON), description="Full typed-event stream")

    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("now()")),
        description="When the row was first persisted.",
    )

    __table_args__ = (
        Index("idx_diagnostic_runs_diag_started", "diagnostic_id", "started_at"),
    )
