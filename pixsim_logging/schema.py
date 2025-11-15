"""Shared schema definitions for structured log entries.

Central place to define the canonical set of log entry column names so that
both direct DB ingestion and API-based ingestion stay in sync.
"""
from __future__ import annotations

# Column names for the log_entries table used by pixsim_logging and the backend.
LOG_ENTRY_COLUMNS = frozenset(
    {
        "timestamp",
        "level",
        "service",
        "env",
        "msg",
        "request_id",
        "job_id",
        "submission_id",
        "artifact_id",
        "provider_job_id",
        "provider_id",
        "operation_type",
        "stage",
        "user_id",
        "error",
        "error_type",
        "duration_ms",
        "attempt",
        "created_at",
    }
)

