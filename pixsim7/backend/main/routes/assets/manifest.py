"""
Assets API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.assets import router

manifest = PluginManifest(
    id="assets",
    name="Assets API",
    version="1.0.0",
    description="Asset and variant management",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["assets"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
