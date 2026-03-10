"""Prompt tools routes plugin manifest."""

from pixsim7.backend.main.api.v1.prompt_tools import router
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest

manifest = PluginManifest(
    id="prompt_tools",
    name="Prompt Tools API",
    version="1.0.0",
    description="Prompt tool catalog and execution endpoints",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["prompt-tools"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
