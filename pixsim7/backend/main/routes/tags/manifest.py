"""
Tags API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.tags import router

manifest = PluginManifest(
    id="tags",
    name="Tags API",
    version="1.0.0",
    description="Structured hierarchical tag management",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["tags"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
