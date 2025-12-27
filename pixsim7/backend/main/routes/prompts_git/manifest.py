"""
Prompts Git API Routes Plugin

Provides Git-like operations for prompt versioning:
- Branch management (create, delete, list, switch)
- Merge operations (with AI conflict resolution)
- History and timeline views
- Rollback and revert
- Tag management
- Cherry-pick
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.prompts_git import router

manifest = PluginManifest(
    id="prompts_git",
    name="Prompts Git Operations API",
    version="1.0.0",
    description="Git-like version control for prompts - branches, merges, tags, rollback",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["prompts", "git", "versioning"],
    dependencies=["prompts"],  # Depends on base prompts route
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
