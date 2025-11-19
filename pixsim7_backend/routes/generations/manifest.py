"""
Generations API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.generations import router

manifest = PluginManifest(
    id="generations",
    name="Generations API",
    version="1.0.0",
    description="Unified generation pipeline for content generation from Generation Nodes",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["generations"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=True,
    enabled=True,
)
