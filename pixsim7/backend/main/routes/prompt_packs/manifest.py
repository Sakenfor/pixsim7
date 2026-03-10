"""Prompt pack authoring routes plugin manifest."""

from pixsim7.backend.main.api.v1.prompt_packs import router
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest

manifest = PluginManifest(
    id="prompt_packs",
    name="Prompt Packs API",
    version="1.0.0",
    description="User-authored prompt pack draft authoring, compile, and version endpoints",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["prompt-packs"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
