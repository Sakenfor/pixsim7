"""
Logs API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.logs import router

manifest = PluginManifest(
    id="logs",
    name="Logs API",
    version="1.0.0",
    description="System and application log endpoints",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/logs",
    tags=["logs"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
