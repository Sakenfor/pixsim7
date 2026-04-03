"""
App Map Snapshot API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_app_map import router


manifest = PluginManifest(
    id="dev_app_map",
    name="App Map Snapshot API",
    version="2.0.0",
    description="Canonical App Map snapshot endpoint for dev tooling",
    author="PixSim Team",
    kind="route",
    prefix="",  # Routes already include /dev/app-map
    tags=["dev", "app-map", "architecture", "metadata"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
