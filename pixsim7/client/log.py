"""Client logging — uses pixsim_logging for structured output.

Provides ``get_logger()`` for structured event logging throughout the
client package.  Call ``init_client_logging()`` once at startup (from
``__main__``) to configure the structlog pipeline.
"""
from __future__ import annotations

import logging
import re

import structlog

_logger: structlog.stdlib.BoundLogger | None = None


def redact_url(url: str) -> str:
    """Redact tokens/credentials in URLs for safe logging."""
    return re.sub(r"(token=)[A-Za-z0-9_.-]{20,}", r"\1***", url)


def init_client_logging() -> structlog.stdlib.BoundLogger:
    """Initialize structlog for the client process.  Call once at startup."""
    global _logger
    if _logger is not None:
        return _logger

    from pixsim_logging import configure_logging, configure_stdlib_root_logger

    # Client always uses human-readable console output
    _logger = configure_logging("client", json=False)
    configure_stdlib_root_logger()

    # Suppress noisy third-party loggers that produce unstructured output
    for name in (
        "websockets", "websockets.client", "websockets.server",
        "urllib3", "httpcore", "httpx",
    ):
        logging.getLogger(name).setLevel(logging.WARNING)

    return _logger


def get_logger() -> structlog.stdlib.BoundLogger:
    """Return the client logger, auto-initializing if needed."""
    if _logger is None:
        return init_client_logging()
    return _logger
