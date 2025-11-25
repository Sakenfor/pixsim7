"""
Dev Pixverse Sync API Routes Plugin

Provides a dry-run endpoint for inspecting Pixverse account videos and
checking which ones are already imported as Assets.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_pixverse_sync import router

manifest = PluginManifest(
    id="dev_pixverse_sync",
    name="Dev Pixverse Sync API",
    version="1.0.0",
    description="Dry-run Pixverse video sync for a provider account",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",  # Router already includes /dev/pixverse-sync
    tags=["dev", "pixverse", "sync"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,

    # No special permissions beyond normal user auth
    permissions=[],
)

