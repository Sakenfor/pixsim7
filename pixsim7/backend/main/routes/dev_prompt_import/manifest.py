"""
Prompt Import API Routes Plugin

Provides dev-only endpoint for importing arbitrary prompts into PixSim7.
Accepts prompt text + metadata and creates PromptFamily + PromptVersion records.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_prompt_import import router

manifest = PluginManifest(
    id="dev_prompt_import",
    name="Prompt Import API",
    version="1.0.0",
    description="Dev endpoint for importing prompts from any source",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",  # Router already includes /dev/prompt-import
    tags=["dev", "prompts", "import"],
    dependencies=["dev_prompt_inspector"],  # Uses same prompt analysis infrastructure
    requires_db=True,  # Needs DB to create families/versions
    requires_redis=False,
    enabled=True,

    # No special permissions needed - uses standard user auth
    permissions=[],
)
