"""
CORS Middleware Plugin

Handles Cross-Origin Resource Sharing (CORS) for API requests.
Configures allowed origins, methods, and headers.
"""

from fastapi.middleware.cors import CORSMiddleware

from pixsim7.backend.main.infrastructure.middleware.types import MiddlewareManifest
from pixsim7.backend.main.shared.config import settings

# ===== MIDDLEWARE MANIFEST =====

manifest = MiddlewareManifest(
    id="cors",
    name="CORS Middleware",
    version="1.0.0",
    description="Handles Cross-Origin Resource Sharing (CORS) for API requests",
    author="PixSim Team",
    priority=900,  # Last in chain - CORS should be processed last (executed first)
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    config={
        "allow_origins": settings.cors_origins,
        "allow_credentials": True,
        "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": ["*"],
        "expose_headers": ["*"],
        "max_age": 3600,
    },
)

# ===== MIDDLEWARE CLASS =====

# For CORS, we use Starlette's built-in CORSMiddleware
middleware_class = CORSMiddleware


# ===== LIFECYCLE HOOKS =====

def on_load(app):
    """Called when middleware is loaded (before app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("middleware.cors")
    logger.info(
        "CORS middleware loaded",
        allowed_origins=settings.cors_origins,
    )


async def on_enable():
    """Called when middleware is enabled (after app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("middleware.cors")
    logger.info("CORS middleware enabled")


async def on_disable():
    """Called when middleware is disabled (before app shuts down)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("middleware.cors")
    logger.info("CORS middleware disabled")
