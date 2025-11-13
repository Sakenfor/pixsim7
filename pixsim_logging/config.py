"""Logging configuration utilities using structlog.

Usage:
    from pixsim_logging import configure_logging, get_logger
    logger = configure_logging("api")
    logger.info("logger_initialized")
"""
from __future__ import annotations
import os
import logging
import sys
import structlog
from typing import Any

DEFAULT_LEVEL = "INFO"


def _get_level() -> int:
    level_name = os.getenv("PIXSIM_LOG_LEVEL", DEFAULT_LEVEL).upper()
    return getattr(logging, level_name, logging.INFO)


def configure_logging(service_name: str, *, json: bool | None = None) -> structlog.stdlib.BoundLogger:
    """Configure structlog with JSON or human format based on env.

    Environment vars:
        PIXSIM_LOG_FORMAT=human|json
        PIXSIM_LOG_LEVEL=DEBUG|INFO|WARNING|ERROR|CRITICAL
        PIXSIM_LOG_INGESTION_URL=http://host:port/api/v1/logs/ingest/batch (optional)
        PIXSIM_LOG_DB_URL=postgresql://user:pass@host:port/db  (optional; direct DB ingest)
        LOG_DATABASE_URL=postgresql://...                        (fallback if PIXSIM_LOG_DB_URL not set)
        PIXSIM_LOG_EXCLUDE_PATHS=/health,/metrics               (comma-separated paths to exclude from logging)
        PIXSIM_LOG_SAMPLE_PATHS=/status:50                      (comma-separated path:rate pairs for sampling)
    """
    if json is None:
        fmt_env = os.getenv("PIXSIM_LOG_FORMAT", "json").lower()
        json = fmt_env != "human"

    processors = [
        structlog.contextvars.merge_contextvars,  # Merge context from contextvars (for request_id, etc.)
        structlog.processors.TimeStamper(fmt="iso", key="timestamp"),
        structlog.processors.add_log_level,
        _path_filter_processor,  # Filter noisy paths (health checks) BEFORE other processing
        _sampling_processor,
        _redaction_processor,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    # Determine DB URL presence for diagnostics
    raw_db_url = os.getenv("PIXSIM_LOG_DB_URL") or os.getenv("LOG_DATABASE_URL") or os.getenv("DATABASE_URL")
    db_disabled_reason = None if raw_db_url else "missing_db_url_env"

    # Optional: Add direct DB ingestion handler (preferred)
    try:
        from .db_handler import create_db_handler_from_env
        db_handler = create_db_handler_from_env()
        if db_handler is None and raw_db_url:
            db_disabled_reason = "handler_init_failed"
    except Exception:
        db_handler = None
        if raw_db_url:
            db_disabled_reason = "handler_exception"
    if db_handler:
        processors.append(db_handler)

    # HTTP ingestion fallback removed by policy; only DB handler is used if configured
    http_handler = None

    if json:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer(colors=True))

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(_get_level()),
        context_class=dict,
        cache_logger_on_first_use=True,
    )

    logger = structlog.get_logger().bind(service=service_name, env=os.getenv("PIXSIM_ENV", "dev"))
    logger.info(
        "logger_initialized",
        format="json" if json else "human",
        log_db_ingestion="enabled" if db_handler else "disabled",
        http_ingestion="disabled",
        db_disabled_reason=db_disabled_reason,
    )
    if not db_handler and db_disabled_reason:
        logger.warning("log_db_ingestion_disabled", reason=db_disabled_reason)
    elif db_handler:
        try:
            logger.info("log_db_ingestion_ready", table=db_handler.table.name)
        except Exception:
            pass
    return logger


def get_logger() -> structlog.stdlib.BoundLogger:
    return structlog.get_logger()


# ===== Processors =====

def _redaction_processor(logger, method_name: str, event_dict: dict[str, Any]):
    for key in list(event_dict.keys()):
        lk = key.lower()
        if lk in {"api_key", "jwt_token", "authorization", "password", "secret"}:
            event_dict[key] = "***redacted***"
    return event_dict


def _path_filter_processor(logger, method_name: str, event_dict: dict[str, Any]):
    """Filter out logs for specific paths (e.g., health checks).

    Environment variables:
        PIXSIM_LOG_EXCLUDE_PATHS: comma-separated list of paths to exclude (default: /health)
        PIXSIM_LOG_SAMPLE_PATHS: comma-separated path:rate pairs (e.g., "/metrics:100" = 1 in 100)

    Examples:
        PIXSIM_LOG_EXCLUDE_PATHS=/health,/metrics  # Completely filter out these paths
        PIXSIM_LOG_SAMPLE_PATHS=/status:50          # Sample 1 in 50 for /status path
    """
    event_type = event_dict.get("event")
    path = event_dict.get("path")

    # Only process http_request events with a path
    if event_type != "http_request" or not path:
        return event_dict

    # Default: exclude /health if no explicit configuration
    exclude_paths_env = os.getenv("PIXSIM_LOG_EXCLUDE_PATHS")
    if exclude_paths_env is None:
        # Default behavior: filter out /health
        if path == "/health":
            return {}
    elif exclude_paths_env.strip():
        # Explicit configuration
        excluded = [p.strip() for p in exclude_paths_env.split(",") if p.strip()]
        if path in excluded:
            return {}  # Drop this log

    # Check sampling rules
    sample_paths = os.getenv("PIXSIM_LOG_SAMPLE_PATHS", "").strip()
    if sample_paths:
        import random
        for rule in sample_paths.split(","):
            rule = rule.strip()
            if ":" not in rule:
                continue
            rule_path, rate = rule.split(":", 1)
            rule_path = rule_path.strip()
            try:
                rate = int(rate.strip())
            except ValueError:
                continue

            if path == rule_path and rate > 1:
                if random.randint(1, rate) != 1:
                    return {}  # Drop this log (sampled out)

    return event_dict


def _sampling_processor(logger, method_name: str, event_dict: dict[str, Any]):
    """Simple sampling for provider:status events.
    PIXSIM_LOG_SAMPLING_PROVIDER_STATUS: log 1 in N status events (default 1 = no sampling).
    """
    stage = event_dict.get("stage")
    if stage == "provider:status":
        n = int(os.getenv("PIXSIM_LOG_SAMPLING_PROVIDER_STATUS", "1"))
        if n > 1:
            import random
            if random.randint(1, n) != 1:
                # Drop by returning empty dict -> suppressed
                return {}
    return event_dict
