"""
Vocabulary API Routes Plugin

Production read endpoints exposing VocabularyRegistry data (parts, poses,
moods, locations, roles, etc.) to the frontend for autocomplete and
reference pickers.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.vocabulary import router

manifest = PluginManifest(
    id="vocabulary",
    name="Vocabulary API",
    version="1.0.0",
    description="Read endpoints for vocabulary items (parts, poses, moods, etc.)",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",  # Router already includes /vocabulary
    tags=["vocabulary"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
