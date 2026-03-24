"""
URL Browse API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.url_browse import router

manifest = PluginManifest(
    id="url_browse",
    name="URL Browse API",
    version="1.0.0",
    description="Server-side URL fetching and media extraction for in-app browsing",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["tools"],
    dependencies=["auth"],
    requires_db=False,
    requires_redis=False,
    enabled=True,
)
