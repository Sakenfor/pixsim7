"""
Admin Codegen API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.codegen import router

manifest = PluginManifest(
    id="codegen",
    name="Codegen Admin API",
    version="1.0.0",
    description="Admin endpoints to list and run codegen tasks",
    author="PixSim Team",
    kind="route",
    service="devtools",
    prefix="/api/v1",
    tags=["admin", "codegen", "dev"],
    dependencies=["auth"],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    permissions=["admin:routes"],
)

