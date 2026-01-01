"""
Concepts API Routes
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.routes.concepts.routes import router

manifest = PluginManifest(
    id="concepts",
    name="Concepts API",
    version="1.0.0",
    description="Runtime access to ontology concepts including composition roles",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["concepts"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
)
