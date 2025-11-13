"""Logging spec definitions: field catalog, stage taxonomy, helpers.

No runtime coupling to application domain objects.
"""
from __future__ import annotations
from typing import Dict, Any

COMMON_FIELDS = [
    "timestamp",
    "level",
    "msg",
    "service",
    "env",
    "request_id",
    "job_id",
    "submission_id",
    "artifact_id",
    "provider_job_id",
    "provider_id",
    "operation_type",
    "stage",
    "attempt",
    "duration_ms",
    "error",
    "error_type",
]

# Stage taxonomy (pipeline + provider lifecycle)
STAGES = [
    "pipeline:start",
    "pipeline:artifact",
    "provider:map_params",
    "provider:submit",
    "provider:status",
    "provider:complete",
    "provider:error",
    "retry:decision",
]

SENSITIVE_KEYS = {"api_key", "jwt_token", "authorization", "password", "secret"}


def redact_sensitive(event: Dict[str, Any]) -> Dict[str, Any]:
    """Redact known sensitive keys in-place (shallow)."""
    for k in list(event.keys()):
        if k.lower() in SENSITIVE_KEYS:
            event[k] = "***redacted***"
    return event


def bind_job_context(logger, job_id: int | None = None, operation_type: str | None = None, provider_id: str | None = None):
    ctx = {}
    if job_id is not None:
        ctx["job_id"] = job_id
    if operation_type is not None:
        ctx["operation_type"] = operation_type
    if provider_id is not None:
        ctx["provider_id"] = provider_id
    return logger.bind(**ctx)


def bind_artifact_context(logger, artifact_id: int | None = None, submission_id: int | None = None):
    ctx = {}
    if artifact_id is not None:
        ctx["artifact_id"] = artifact_id
    if submission_id is not None:
        ctx["submission_id"] = submission_id
    return logger.bind(**ctx)
