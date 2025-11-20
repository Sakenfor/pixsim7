"""
Providers API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.providers import router

manifest = PluginManifest(
    id="providers",
    name="Providers API",
    version="1.0.0",
    description="Video generation provider endpoints",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["providers"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
