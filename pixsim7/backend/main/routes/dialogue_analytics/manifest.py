"""
Dialogue Analytics API Routes Plugin

Provides endpoints for dialogue cost tracking, engagement metrics,
quality analysis, and model/program performance comparisons.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.analytics import router

manifest = PluginManifest(
    id="dialogue_analytics",
    name="Dialogue Analytics API",
    version="1.0.0",
    description="Track dialogue generation costs, engagement, and performance metrics",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["dialogue", "analytics"],
    dependencies=[],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
