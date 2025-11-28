"""
Prompt Family Timeline API Routes Plugin

Provides dev-only endpoint for viewing prompt family timeline with
versions, blocks, and assets along with performance metrics.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_prompt_timeline import router

manifest = PluginManifest(
    id="dev_prompt_timeline",
    name="Prompt Family Timeline API",
    version="1.0.0",
    description="Dev endpoint for prompt family timeline and performance view",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",  # Router already includes /dev/prompt-families
    tags=["dev", "prompts", "timeline", "performance"],
    dependencies=[],
    requires_db=True,  # Needs DB to query versions, blocks, assets, fit scores
    requires_redis=False,
    enabled=True,

    # No special permissions needed - uses standard user auth
    permissions=[],
)
