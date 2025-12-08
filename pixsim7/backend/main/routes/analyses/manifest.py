"""
Analyses API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.analyses import router

manifest = PluginManifest(
    id="analyses",
    name="Analyses API",
    version="1.0.0",
    description="Asset analysis jobs - face detection, scene tagging, content moderation, etc.",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["analyses"],
    dependencies=["auth", "assets"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
