"""
Providers API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.providers import router

manifest = PluginManifest(
    id="providers",
    name="Providers API",
    version="1.0.0",
    description="Video generation provider endpoints",
    author="PixSim Team",
    prefix="/api/v1",
    tags=["providers"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
