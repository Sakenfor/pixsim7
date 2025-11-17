"""
Automation API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.automation import router

manifest = PluginManifest(
    id="automation",
    name="Automation API",
    version="1.0.0",
    description="Android automation and action presets",
    author="PixSim Team",
    prefix="/api/v1",
    tags=["automation"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
