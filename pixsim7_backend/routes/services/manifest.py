"""
Services API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.services import router

manifest = PluginManifest(
    id="services",
    name="Services API",
    version="1.0.0",
    description="Service management and orchestration",
    author="PixSim Team",
    prefix="/api/v1",
    tags=["services"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=True,
    enabled=True,
)
