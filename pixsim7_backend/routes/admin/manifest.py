"""
Admin API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.admin import router

manifest = PluginManifest(
    id="admin",
    name="Admin API",
    version="1.0.0",
    description="Administrative endpoints (users, quotas, system info)",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["admin"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
