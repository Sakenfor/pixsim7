"""
AI Assistant Profiles Routes Plugin

CRUD for assistant profiles — persona, model, method, tool scope.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.assistants import router

manifest = PluginManifest(
    id="assistants",
    name="AI Assistants API",
    version="1.0.0",
    description="AI assistant profile management — create, list, switch personas",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/assistants",
    tags=["ai", "assistants"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
