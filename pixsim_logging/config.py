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
from typing import Any, List, Optional


def _ensure_utf8_stdout():
    """Ensure stdout/stderr use UTF-8 encoding on Windows.

    Windows console uses cp1252 by default which can't handle many Unicode
    characters (like →). This reconfigures stdout/stderr to use UTF-8 with
    'replace' error handling to prevent crashes from unencodable chars.
    """
    if sys.platform == "win32":
        # Reconfigure stdout/stderr to use UTF-8 with error replacement
        # This prevents UnicodeEncodeError when logging non-ASCII chars
        if hasattr(sys.stdout, 'reconfigure'):
            try:
                sys.stdout.reconfigure(encoding='utf-8', errors='replace')
            except Exception:
                pass  # Some environments don't support reconfigure
        if hasattr(sys.stderr, 'reconfigure'):
            try:
                sys.stderr.reconfigure(encoding='utf-8', errors='replace')
            except Exception:
                pass

DEFAULT_LEVEL = "INFO"


def _get_level() -> int:
    level_name = os.getenv("PIXSIM_LOG_LEVEL", DEFAULT_LEVEL).upper()
    return getattr(logging, level_name, logging.INFO)


def configure_logging(service_name: str, *, json: bool | None = None) -> structlog.stdlib.BoundLogger:
    """Configure structlog with JSON or human format based on env.

    Environment vars:
        PIXSIM_LOG_FORMAT=human|json
        PIXSIM_LOG_LEVEL=DEBUG|INFO|WARNING|ERROR|CRITICAL
        PIXSIM_LOG_INGESTION_URL=http://host:port/api/v1/logs/ingest/batch (optional; HTTP ingest)
        PIXSIM_LOG_ENABLE_HTTP=true|false                       (default true if URL set)
        PIXSIM_LOG_DB_URL=postgresql://user:pass@host:port/db  (optional; direct DB ingest)
        LOG_DATABASE_URL=postgresql://...                        (fallback if PIXSIM_LOG_DB_URL not set)
        PIXSIM_LOG_EXCLUDE_PATHS=/health,/metrics               (comma-separated paths to exclude from logging)
        PIXSIM_LOG_SAMPLE_PATHS=/status:50                      (comma-separated path:rate pairs for sampling)
    """
    # Ensure UTF-8 output on Windows to handle Unicode in log messages
    _ensure_utf8_stdout()

    # Avoid reconfiguring structlog repeatedly unless explicitly requested.
    # structlog keeps a global configuration; calling configure() many times
    # can stack processors and create duplicate handlers.
    if getattr(configure_logging, "_configured", False):
        # Return a logger bound with the requested service name but do not
        # touch global configuration again.
        return structlog.get_logger().bind(service=service_name, env=os.getenv("PIXSIM_ENV", "dev"))

    if json is None:
        fmt_env = os.getenv("PIXSIM_LOG_FORMAT", "json").lower()
        json = fmt_env != "human"

    processors: List[structlog.types.Processor] = [
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

    # Optional: Add direct DB ingestion handler (preferred when available)
    try:
        from .db_handler import create_db_handler_from_env
        db_handler = create_db_handler_from_env()
        if db_handler is None and raw_db_url:
            db_disabled_reason = "handler_init_failed"
    except ImportError:
        # Import error is worth surfacing clearly in the log message below.
        db_handler = None
        if raw_db_url:
            db_disabled_reason = "handler_import_error"
    except Exception:
        # Any other unexpected failure creating the handler should not break
        # application startup, but we record a distinct reason.
        db_handler = None
        if raw_db_url:
            db_disabled_reason = "handler_exception"
    if db_handler:
        processors.append(db_handler)

    # Optional: Add HTTP ingestion handler (secondary path). This is useful for
    # services that cannot reach the DB directly but can hit a central ingest
    # API. Controlled via PIXSIM_LOG_INGESTION_URL and PIXSIM_LOG_ENABLE_HTTP.
    # When a DB handler is active, HTTP is disabled by default to avoid
    # duplicate writes unless explicitly forced via PIXSIM_LOG_ENABLE_HTTP=force.
    http_handler = None
    http_url = os.getenv("PIXSIM_LOG_INGESTION_URL")
    http_enabled_env = os.getenv("PIXSIM_LOG_ENABLE_HTTP", "true").lower()
    # If a DB handler is configured, treat HTTP as opt-in via 'force'.
    if db_handler and http_enabled_env not in {"force"}:
        http_enabled = False
    else:
        http_enabled = http_url is not None and http_enabled_env not in {"0", "false", "no"}
    http_disabled_reason = None if http_enabled else "missing_or_disabled"

    if http_enabled and http_url:
        try:
            from .http_handler import create_http_handler_from_env

            http_handler = create_http_handler_from_env()
            if http_handler is None:
                http_disabled_reason = "handler_init_failed"
        except ImportError:
            http_handler = None
            http_disabled_reason = "handler_import_error"
        except Exception:
            http_handler = None
            http_disabled_reason = "handler_exception"

    if http_handler is not None:
        processors.append(http_handler)

    if json:
        # Use ensure_ascii=False to preserve unicode characters like → instead of \u2192
        processors.append(structlog.processors.JSONRenderer(serializer=lambda obj, **kw: __import__('json').dumps(obj, ensure_ascii=False, **kw)))
    else:
        from .console_renderer import CleanConsoleRenderer
        processors.append(CleanConsoleRenderer(colors=True))

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
        http_ingestion="enabled" if http_handler else "disabled",
        db_disabled_reason=db_disabled_reason,
        http_disabled_reason=http_disabled_reason,
    )
    if not db_handler and db_disabled_reason:
        logger.warning("log_db_ingestion_disabled", reason=db_disabled_reason)
    elif db_handler:
        try:
            logger.info("log_db_ingestion_ready", table=db_handler.table.name)
        except Exception:
            pass
    if not http_handler and http_disabled_reason not in (None, "missing_or_disabled"):
        logger.warning("log_http_ingestion_disabled", reason=http_disabled_reason)
    # Mark configuration as done to keep future calls idempotent.
    setattr(configure_logging, "_configured", True)
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


def _should_log_http_event(event_dict: dict[str, Any], *, exclude_paths: Optional[list[str]] = None,
                           sample_rules: Optional[dict[str, int]] = None) -> bool:
    """Pure helper to decide whether an http_request-style event should be kept.

    This is factored out to make behavior easier to test by passing explicit
    configuration instead of relying on environment variables.
    """
    event_type = event_dict.get("event")
    path = event_dict.get("path")
    if event_type != "http_request" or not path:
        return True

    # Exclude paths: default is ["/health"] if none explicitly provided.
    effective_excludes = exclude_paths if exclude_paths is not None else ["/health"]
    if path in effective_excludes:
        return False

    # Per-path sampling: 1 in N for configured paths.
    if sample_rules:
        rate = sample_rules.get(path)
        if rate and rate > 1:
            import random
            if random.randint(1, rate) != 1:
                return False

    return True


def _path_filter_processor(logger, method_name: str, event_dict: dict[str, Any]):
    """Filter out logs for specific paths (e.g., health checks).

    Environment variables:
        PIXSIM_LOG_EXCLUDE_PATHS: comma-separated list of paths to exclude (default: /health)
        PIXSIM_LOG_SAMPLE_PATHS: comma-separated path:rate pairs (e.g., "/metrics:100" = 1 in 100)
    """
    exclude_paths_env = os.getenv("PIXSIM_LOG_EXCLUDE_PATHS")
    if exclude_paths_env is None:
        exclude_paths: Optional[list[str]] = None
    else:
        exclude_paths = [p.strip() for p in exclude_paths_env.split(",") if p.strip()] or []

    sample_paths_raw = os.getenv("PIXSIM_LOG_SAMPLE_PATHS", "").strip()
    sample_rules: dict[str, int] = {}
    if sample_paths_raw:
        for rule in sample_paths_raw.split(","):
            rule = rule.strip()
            if ":" not in rule:
                continue
            rule_path, rate = rule.split(":", 1)
            rule_path = rule_path.strip()
            try:
                rate_int = int(rate.strip())
            except ValueError:
                continue
            if rate_int > 1:
                sample_rules[rule_path] = rate_int

    if not _should_log_http_event(event_dict, exclude_paths=exclude_paths, sample_rules=sample_rules or None):
        raise structlog.DropEvent
    return event_dict


def _sampling_processor(logger, method_name: str, event_dict: dict[str, Any]):
    """Simple sampling for provider:status events.
    PIXSIM_LOG_SAMPLING_PROVIDER_STATUS: log 1 in N status events (default 1 = no sampling).
    """
    stage = event_dict.get("stage")
    if stage == "provider:status":
        try:
            n = int(os.getenv("PIXSIM_LOG_SAMPLING_PROVIDER_STATUS", "1"))
        except ValueError:
            n = 1
        if n > 1:
            import random
            if random.randint(1, n) != 1:
                # Drop the event entirely so downstream processors (DB, JSON renderer, etc.)
                # don't see an empty payload.
                raise structlog.DropEvent
    return event_dict
