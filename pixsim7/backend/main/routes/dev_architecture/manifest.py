"""
Backend Architecture Introspection API Routes Plugin

Provides live introspection of backend architecture for the App Map Panel.
Returns routes, capabilities, services, permissions, and metrics.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_architecture import router

manifest = PluginManifest(
    id="dev_architecture",
    name="Backend Architecture Introspection API",
    version="1.0.0",
    description="Live introspection of backend architecture for dev tools",
    author="PixSim Team",
    kind="route",
    prefix="",  # Routes already include /dev/architecture
    tags=["dev", "introspection", "architecture"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,

    # No permissions needed - this is a read-only dev tool
    permissions=[],
)
