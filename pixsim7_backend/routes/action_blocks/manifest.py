"""
Action Blocks API Routes Plugin

Database-backed action blocks with AI extraction, composition, and concept discovery.
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.action_blocks import router

manifest = PluginManifest(
    id="action_blocks",
    name="Action Blocks API",
    version="1.0.0",
    description="Reusable action blocks with AI extraction and concept discovery",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["action_blocks"],
    dependencies=["auth", "prompts"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
