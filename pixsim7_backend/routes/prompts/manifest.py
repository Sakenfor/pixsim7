"""
Prompts API Routes Plugin

Git-like prompt versioning and variant feedback management.
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.prompts import router

manifest = PluginManifest(
    id="prompts",
    name="Prompts Versioning API",
    version="1.0.0",
    description="Git-like prompt versioning with variant feedback tracking",
    author="PixSim Team",
    prefix="/api/v1",
    tags=["prompts"],
    dependencies=["auth", "assets"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
