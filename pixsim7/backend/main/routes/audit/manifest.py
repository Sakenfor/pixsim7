"""Shared Audit API routes plugin."""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.audit import router

manifest = PluginManifest(
    id="audit",
    name="Audit API",
    version="1.0.0",
    description="Shared read APIs for entity mutation audit events",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["audit"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
