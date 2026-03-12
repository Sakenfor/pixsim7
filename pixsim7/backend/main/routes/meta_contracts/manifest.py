"""
Meta Contract Discovery Routes Plugin

Lists machine-readable API contracts for agent/tool discovery.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.meta_contracts import router

manifest = PluginManifest(
    id="meta_contracts",
    name="Meta Contract Discovery API",
    version="1.0.0",
    description="Machine-readable contract index for API discovery",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["meta", "contracts"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
