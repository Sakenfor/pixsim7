"""
Database Admin API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.admin import database_router as router

manifest = PluginManifest(
    id="database",
    name="Database Admin API",
    version="1.0.0",
    description="Database administration endpoints",
    author="PixSim Team",
    kind="route",
    prefix="/api",
    tags=["database"],
    dependencies=[],  # Admin routes, no auth dependency
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
