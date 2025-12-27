"""
LLM Cache Management API Routes Plugin

Provides endpoints for LLM cache statistics, invalidation,
and management functionality.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.llm_cache import router

manifest = PluginManifest(
    id="llm_cache",
    name="LLM Cache Management API",
    version="1.0.0",
    description="Manage LLM response cache - stats, invalidation, and cleanup",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["llm", "cache"],
    dependencies=[],
    requires_db=False,
    requires_redis=True,
    enabled=True,
)
