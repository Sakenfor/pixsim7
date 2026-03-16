"""
Notifications API Routes Plugin
"""
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.notifications import router

manifest = PluginManifest(
    id="notifications",
    name="Notifications API",
    version="1.0.0",
    description="Broadcast and targeted notifications for plan events, features, and agent actions",
    author="PixSim Team",
    kind="route",
    prefix="",
    tags=["notifications"],
    dependencies=[],
    requires_db=True,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
