"""
Admin Plugin Diagnostics Routes

Provides admin endpoints for plugin monitoring and diagnostics.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.admin_plugins import router

manifest = PluginManifest(
    id="admin_plugins",
    name="Admin Plugin Diagnostics",
    version="1.0.0",
    description="Admin endpoints for plugin monitoring, metrics, and diagnostics (Phase 16.5)",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["admin", "plugins"],
    dependencies=["admin"],  # Requires admin routes
    requires_db=False,
    requires_redis=False,
    enabled=True,

    permissions=[
        "admin:routes",  # Admin-only access
        "log:emit",
    ],
)
