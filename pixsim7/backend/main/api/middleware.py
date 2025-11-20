"""
Custom middleware for request tracking and logging
"""
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import structlog


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
