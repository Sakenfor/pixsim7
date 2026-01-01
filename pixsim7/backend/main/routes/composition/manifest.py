"""
Composition Packages API Routes
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.routes.composition.routes import router

manifest = PluginManifest(
    id="composition",
    name="Composition Packages API",
    version="1.0.0",
    description="Exposes composition packages and roles for multi-image generation",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["composition"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
)
