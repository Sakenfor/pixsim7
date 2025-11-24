"""
Prompt Inspector API Routes Plugin

Provides dev-only endpoint for inspecting and analyzing prompts.
Shows structured breakdown of prompt components used in generations.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_prompt_inspector import router

manifest = PluginManifest(
    id="dev_prompt_inspector",
    name="Prompt Inspector API",
    version="1.0.0",
    description="Dev endpoint for inspecting prompt structure and components",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",  # Router already includes /dev/prompt-inspector
    tags=["dev", "prompts", "analysis", "inspector"],
    dependencies=[],
    requires_db=True,  # Needs DB to look up generations/assets
    requires_redis=False,
    enabled=True,

    # No special permissions needed - uses standard user auth
    permissions=[],
)
