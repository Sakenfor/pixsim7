"""
Behavior Registry Introspection API Plugin

Provides endpoints for discovering registered behavior extensions:
- Conditions, effects, and scoring factors
- Parameter schemas for dynamic UI generation
- Registry statistics
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.behavior_registry import router

manifest = PluginManifest(
    id="behavior_registry",
    name="Behavior Registry Introspection API",
    version="1.0.0",
    description="Dynamic discovery of registered conditions, effects, and scoring factors",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/behavior",
    tags=["behavior-registry"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
)
