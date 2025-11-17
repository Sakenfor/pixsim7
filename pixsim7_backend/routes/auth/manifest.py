"""
Auth API Routes Plugin

Authentication endpoints including register, login, logout, and session management.
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.auth import router

# ===== PLUGIN MANIFEST =====

manifest = PluginManifest(
    id="auth",
    name="Authentication API",
    version="1.0.0",
    description="User authentication endpoints (register, login, logout, sessions)",
    author="PixSim Team",
    prefix="/api/v1",
    tags=["auth"],
    dependencies=[],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)

# Export the router from api/v1/auth.py
# (no need to redefine it, just reference the existing one)

# ===== LIFECYCLE HOOKS =====

def on_load(app):
    """Called when route plugin is loaded (before app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("routes.auth")
    logger.info("Auth routes loaded")


async def on_enable():
    """Called when route plugin is enabled (after app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("routes.auth")
    logger.info("Auth routes enabled")


async def on_disable():
    """Called when route plugin is disabled (before app shuts down)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("routes.auth")
    logger.info("Auth routes disabled")
