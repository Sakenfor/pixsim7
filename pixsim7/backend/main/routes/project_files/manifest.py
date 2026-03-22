"""Project Files API Routes Plugin"""
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.project_files import router

manifest = PluginManifest(
    id="project_files",
    name="Project Files API",
    version="1.0.0",
    description="Read-only project file access for AI agents",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["files", "dev"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
