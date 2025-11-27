"""
Prompt Category Discovery API Routes Plugin

Provides dev-only endpoint for AI-assisted category discovery.
Analyzes prompts and suggests ontology IDs, semantic pack entries, and ActionBlocks.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_prompt_categories import router

manifest = PluginManifest(
    id="dev_prompt_categories",
    name="Prompt Category Discovery API",
    version="1.0.0",
    description="Dev endpoint for AI-assisted prompt category and ontology discovery",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",  # Router already includes /dev/prompt-categories
    tags=["dev", "prompts", "ontology", "ai", "categories"],
    dependencies=["ai"],  # Depends on AI Hub service
    requires_db=True,  # Needs DB for AI Hub operations
    requires_redis=False,
    enabled=True,

    # No special permissions needed - uses standard user auth
    permissions=[],
)
