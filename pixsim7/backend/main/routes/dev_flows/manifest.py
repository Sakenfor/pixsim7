"""
Journey Flow Mapping API Routes Plugin

Provides route access for flow template graph and context resolver endpoints.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_flows import router

manifest = PluginManifest(
    id="dev_flows",
    name="Journey Flow Mapping API",
    version="1.0.0",
    description="Flow template graph and resolver endpoints for dev tools",
    author="PixSim Team",
    kind="route",
    service="devtools",
    prefix="",  # Routes already include /dev/flows
    tags=["dev", "flows", "journeys"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
