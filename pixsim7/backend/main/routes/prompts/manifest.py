"""
Prompts API Routes Plugin

Git-like prompt versioning and variant feedback management.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.prompts import router

manifest = PluginManifest(
    id="prompts",
    name="Prompts Versioning API",
    version="1.0.0",
    description="Git-like prompt versioning with variant feedback tracking",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["prompts"],
    dependencies=["auth", "assets"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
