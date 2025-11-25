"""
AI Hub API Routes Plugin

LLM-powered operations for prompt editing and AI assistance.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.ai import router

manifest = PluginManifest(
    id="ai",
    name="AI Hub API",
    version="1.0.0",
    description="LLM-powered prompt editing and AI assistance endpoints",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/ai",
    tags=["ai", "llm", "prompts"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
