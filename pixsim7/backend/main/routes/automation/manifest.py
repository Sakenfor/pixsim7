"""
Automation API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.automation import router

manifest = PluginManifest(
    id="automation",
    name="Automation API",
    version="1.0.0",
    description="Android automation and action presets",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["automation"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
