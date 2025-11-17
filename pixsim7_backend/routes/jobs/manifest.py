"""
Jobs API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.jobs import router

manifest = PluginManifest(
    id="jobs",
    name="Jobs API",
    version="1.0.0",
    description="Video generation job management",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["jobs"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=True,
    enabled=True,
)
