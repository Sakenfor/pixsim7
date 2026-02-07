"""
Dev Docs API Routes Plugin
"""
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_docs import router

manifest = PluginManifest(
    id="dev_docs",
    name="Dev Docs API",
    version="1.0.0",
    description="Indexed documentation with AST and link graph",
    author="PixSim Team",
    kind="route",
    prefix="",
    tags=["dev", "docs"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
