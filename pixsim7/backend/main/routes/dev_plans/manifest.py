"""
Dev Plans API Routes Plugin
"""
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_plans import router

manifest = PluginManifest(
    id="dev_plans",
    name="Dev Plans API",
    version="1.0.0",
    description="Read-only access to plan registry manifests and markdown",
    author="PixSim Team",
    kind="route",
    prefix="",
    tags=["dev", "plans"],
    dependencies=[],
    requires_db=True,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
