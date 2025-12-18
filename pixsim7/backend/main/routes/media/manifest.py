"""
Media API Routes Plugin

Provides media serving and ingestion control endpoints.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.media import router

manifest = PluginManifest(
    id="media",
    name="Media API",
    version="1.0.0",
    description="Media serving, ingestion control, and settings",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["media"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
