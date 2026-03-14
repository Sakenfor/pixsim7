"""
Dev Testing API Routes Plugin
"""
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_testing import router

manifest = PluginManifest(
    id="dev_testing",
    name="Dev Testing API",
    version="1.0.0",
    description="Live test suite discovery and catalog validation",
    author="PixSim Team",
    kind="route",
    prefix="",
    tags=["dev", "testing"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
