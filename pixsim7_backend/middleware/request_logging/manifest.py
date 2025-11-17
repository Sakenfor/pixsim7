"""
Request Logging Middleware Plugin

Logs HTTP request metrics including method, path, status code, and duration.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from time import time as _time

from pixsim7_backend.infrastructure.middleware.types import MiddlewareManifest
from pixsim_logging import configure_logging

logger = configure_logging("api")

# ===== MIDDLEWARE MANIFEST =====

manifest = MiddlewareManifest(
    id="request_logging",
    name="Request Logging Middleware",
    version="1.0.0",
    description="Logs HTTP request metrics (method, path, status, duration)",
    author="PixSim Team",
    priority=200,  # After request tracking, for logging
    dependencies=["request_id"],  # Depends on request_id for proper log correlation
    requires_db=False,
    requires_redis=False,
    enabled=True,
    config={},
)

# ===== MIDDLEWARE CLASS =====

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Logs HTTP request metrics

    Records:
    - Request method and path
    - Response status code
    - Request duration in milliseconds
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        start = _time()
        response = await call_next(request)
        duration_ms = int((_time() - start) * 1000)

        try:
            logger.info(
                "http_request",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )
        except Exception:
            # Silently fail if logging fails (don't break requests)
            pass

        return response


# Export middleware class
middleware_class = RequestLoggingMiddleware


# ===== LIFECYCLE HOOKS =====

def on_load(app):
    """Called when middleware is loaded (before app starts)"""
    logger = configure_logging("middleware.request-logging")
    logger.info("Request Logging middleware loaded")


async def on_enable():
    """Called when middleware is enabled (after app starts)"""
    logger = configure_logging("middleware.request-logging")
    logger.info("Request Logging middleware enabled")


async def on_disable():
    """Called when middleware is disabled (before app shuts down)"""
    logger = configure_logging("middleware.request-logging")
    logger.info("Request Logging middleware disabled")
