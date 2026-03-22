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
    "domain",
    "request_id",
    "job_id",
    "submission_id",
    "generation_id",
    "provider_job_id",
    "provider_id",
    "operation_type",
    "stage",
    "channel",
    "user_id",
    "attempt",
    "duration_ms",
    "error",
    "error_type",
    "created_at",
]

# Canonical domain list — shared between backend (structlog domain filter)
# and frontend (debugFlags categories). Keep alphabetical within groups.
#
# Backend-primary: generation, account, provider, cron, system, worker, audit
# Frontend-primary: localFolders, overlay, persistence, stores, websocket
# Shared: generation, provider
DOMAINS = [
    "account",
    "audit",
    "cron",
    "generation",
    "localFolders",
    "overlay",
    "persistence",
    "provider",
    "stores",
    "system",
    "websocket",
    "worker",
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

STAGES_SET = set(STAGES)

# Channel taxonomy (what kind of activity)
CHANNELS = ["cron", "pipeline", "api", "system"]

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


def bind_generation_context(logger, generation_id: int | None = None, submission_id: int | None = None):
    ctx = {}
    if generation_id is not None:
        ctx["generation_id"] = generation_id
    if submission_id is not None:
        ctx["submission_id"] = submission_id
    return logger.bind(**ctx)


def bind_domain_context(logger, domain: str):
    """Bind a business domain to the logger for domain-level filtering."""
    return logger.bind(domain=domain)


def ensure_valid_stage(stage: str) -> str:
    """Return a valid stage string, passing through unknown stages.

    This is intentionally lenient: it allows ad-hoc stages, but provides a
    single place for callers to normalize or validate against the known
    taxonomy (STAGES). Callers can choose to assert membership if they want.
    """
    # Example hook for future normalization, e.g. lowering, mapping aliases, etc.
    return stage
