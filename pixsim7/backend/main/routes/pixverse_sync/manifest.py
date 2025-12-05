"""
Pixverse Sync API Routes Plugin

Provides endpoints for syncing Pixverse videos/images into Assets
without triggering automatic lineage creation.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.pixverse_sync import router

manifest = PluginManifest(
    id="pixverse_sync",
    name="Pixverse Sync API",
    version="1.0.0",
    description="Sync Pixverse videos and images to local Assets",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",  # Router already includes /providers/pixverse
    tags=["pixverse", "sync", "assets"],
    dependencies=["auth", "assets"],
    requires_db=True,
    requires_redis=False,
    enabled=True,

    # No special permissions beyond normal user auth
    permissions=[],
)
