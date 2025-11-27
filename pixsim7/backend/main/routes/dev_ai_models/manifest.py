"""
AI Models API Routes Plugin

Provides dev-only endpoints for inspecting AI models and managing default selections.
Supports the Prompt Lab Models tab for configuring AI models and parsers.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.dev_ai_models import router

manifest = PluginManifest(
    id="dev_ai_models",
    name="AI Models API",
    version="1.0.0",
    description="Dev endpoints for AI model catalog and default model selection",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",  # Router already includes /dev/ai-models
    tags=["dev", "ai", "models"],
    dependencies=[],  # Standalone, uses AI model registry
    requires_db=True,  # Needs DB to read/write defaults
    requires_redis=False,
    enabled=True,

    # No special permissions needed - uses standard user auth
    permissions=[],
)
