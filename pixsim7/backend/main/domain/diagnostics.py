"""Diagnostics persistence models.

``DiagnosticRunRecord`` — persisted history of admin diagnostic runs.
The live run manager (``services/diagnostics/runs.py``) keeps active runs
in process memory for streaming; this table is the durable mirror so run
history survives a reload/restart and is visible from any client (the
in-memory store is single-process and wiped on the dev reloader's restart).
One row per run.  ``events`` holds the full typed-event stream as JSON,
written once when the run reaches a terminal state (per-event DB churn
isn't worth it for an admin surface).

``BackfillApplied`` — the applied-state ledger for one-shot data backfills.
Distinct from ``DiagnosticRunRecord`` (run *telemetry*): this records only
successful ``--apply`` invocations, stamped by the script itself, so it's
authoritative regardless of how the script ran (runner, agent Bash, or a
human CLI). The alembic-revision analogy for data backfills.
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


class BackfillApplied(SQLModel, table=True):
    """Append-only ledger: one row per successful ``--apply`` of a backfill.

    Written by the script via ``record_backfill_applied`` (see
    ``services/diagnostics/applied_ledger.py``), so it captures every apply
    path. Not an upsert/boolean — full apply history stays visible, and
    ``script_sha256`` distinguishes a re-run after the script was edited from
    the original apply (the alembic-revision analogy).
    """

    __tablename__ = "backfill_applied"

    id: Optional[int] = Field(default=None, primary_key=True)
    script_path: str = Field(
        index=True, max_length=512,
        description="Repo-relative posix path of the backfill script (stable identity).",
    )
    git_sha: Optional[str] = Field(
        default=None, max_length=40,
        description="Repo HEAD sha at apply time; null if git was unavailable.",
    )
    script_sha256: Optional[str] = Field(
        default=None, max_length=64,
        description="sha256 of the script file contents at apply time.",
    )
    applied_by: str = Field(
        max_length=128,
        description="Actor: agent:<id> / user:<id> / cli:<os-user> (mirrors run started_by).",
    )
    rows_affected: Optional[int] = Field(
        default=None, description="Rows the apply mutated, if the script reports it."
    )
    notes: Optional[str] = Field(
        default=None, sa_column=Column(Text), description="Free-form note from the script."
    )

    applied_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=text("now()"), index=True
        ),
        description="UTC time the apply completed.",
    )
