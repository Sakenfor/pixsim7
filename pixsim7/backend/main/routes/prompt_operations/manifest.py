"""Prompt operations routes plugin manifest (Phase 2 — op runtime executor)."""

from pixsim7.backend.main.api.v1.prompt_operations import router
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest

manifest = PluginManifest(
    id="prompt_operations",
    name="Prompt Operations API",
    version="1.0.0",
    description="Op-runtime execution endpoint (variant lookup by op_id + params)",
    author="PixSim Team",
    kind="route",
    service="content",
    prefix="/api/v1",
    tags=["prompt-operations"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
