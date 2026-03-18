"""
UI Catalog Meta Contract Routes Plugin

Queryable UI component catalog for AI agents — components, patterns, guidance.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.meta_ui import router

manifest = PluginManifest(
    id="meta_ui",
    name="UI Catalog Meta Contract API",
    version="1.0.0",
    description="Machine-readable UI component catalog for AI agent code generation",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["meta", "ui-catalog"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
)
