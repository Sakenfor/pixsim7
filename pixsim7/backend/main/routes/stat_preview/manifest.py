"""
Generic Stat Preview API Routes Plugin

Provides read-only preview endpoints for stat tier and level computation
using world-specific stat configurations.

This is a generic replacement for the legacy relationship preview API.
Works with any stat type: relationships, skills, reputation, etc.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.stat_preview import router

manifest = PluginManifest(
    id="stat_preview",
    name="Generic Stat Preview API",
    version="1.0.0",
    description="Preview stat tiers and levels for any stat type using world stat configurations",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/stats",
    tags=["stats", "preview"],
    dependencies=[],  # No auth required for preview endpoints
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
