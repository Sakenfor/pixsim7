"""
Semantic Packs API Routes Plugin

Shareable prompt semantics bundles with parser hints and content references.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.semantic_packs import router

manifest = PluginManifest(
    id="semantic_packs",
    name="Semantic Packs API",
    version="1.0.0",
    description="Shareable bundles of prompt semantics, parser hints, and content",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["semantic-packs"],
    dependencies=["auth", "action_blocks"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
