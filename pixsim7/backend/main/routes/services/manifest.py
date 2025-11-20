"""
Services API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.services import router

manifest = PluginManifest(
    id="services",
    name="Services API",
    version="1.0.0",
    description="Service management and orchestration",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["services"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=True,
    enabled=True,
)
