"""
Generation Chains API Routes Plugin

Sequential orchestration of generation steps with template rolling,
asset piping, and per-step guidance.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.generation_chains import router

manifest = PluginManifest(
    id="generation_chains",
    name="Generation Chains API",
    version="1.0.0",
    description="Sequential orchestration of generation steps with template rolling and asset piping",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["generation-chains"],
    dependencies=["auth", "block_templates"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
