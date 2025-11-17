"""
Migrations Admin API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.admin import migrations_router as router

manifest = PluginManifest(
    id="migrations",
    name="Migrations Admin API",
    version="1.0.0",
    description="Database migration management endpoints",
    author="PixSim Team",
    prefix="/api",
    tags=["migrations"],
    dependencies=[],  # Admin routes, no auth dependency
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
