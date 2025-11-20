"""
Request ID Middleware Plugin

Generates a unique request_id for each request and binds it to the structlog context.
This allows tracing all logs related to a specific request.
"""

import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import structlog

from pixsim7.backend.main.infrastructure.middleware.types import MiddlewareManifest

# ===== MIDDLEWARE MANIFEST =====

manifest = MiddlewareManifest(
    id="request_id",
    name="Request ID Middleware",
    version="1.0.0",
    description="Injects unique request IDs for request tracing",
    author="PixSim Team",
    priority=100,  # Early in chain - request tracking
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    config={},
)

# ===== MIDDLEWARE CLASS =====

class RequestIdMiddleware(BaseHTTPMiddleware):
    """
    Middleware to inject request_id into all logs using structlog

    Generates a unique request_id for each request and binds it to the structlog context.
    This allows tracing all logs related to a specific request.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Generate unique request ID
        request_id = str(uuid.uuid4())

        # Store in request state for access in endpoints
        request.state.request_id = request_id

        # Bind request_id to structlog context for this request
        logger = structlog.get_logger()
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        try:
            response = await call_next(request)
            # Add request_id to response headers for client-side debugging
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            # Clear contextvars after request
            structlog.contextvars.clear_contextvars()


# Export middleware class
middleware_class = RequestIdMiddleware


# ===== LIFECYCLE HOOKS =====

def on_load(app):
    """Called when middleware is loaded (before app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("middleware.request-id")
    logger.info("Request ID middleware loaded")


async def on_enable():
    """Called when middleware is enabled (after app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("middleware.request-id")
    logger.info("Request ID middleware enabled")


async def on_disable():
    """Called when middleware is disabled (before app shuts down)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("middleware.request-id")
    logger.info("Request ID middleware disabled")
