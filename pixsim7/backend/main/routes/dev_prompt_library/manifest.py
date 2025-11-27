"""
Prompt Library API Routes Plugin

Provides dev-only endpoints for browsing and analyzing prompt families and versions.
Supports the Prompt Lab dev UI with detailed inspection and analysis features.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_prompt_library import router

manifest = PluginManifest(
    id="dev_prompt_library",
    name="Prompt Library API",
    version="1.0.0",
    description="Dev endpoints for browsing and analyzing prompt families/versions",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",  # Router already includes /dev/prompt-library
    tags=["dev", "prompts", "library"],
    dependencies=["dev_prompt_inspector"],  # Uses prompt analysis infrastructure
    requires_db=True,  # Needs DB to read families/versions
    requires_redis=False,
    enabled=True,

    # No special permissions needed - uses standard user auth
    permissions=[],
)
