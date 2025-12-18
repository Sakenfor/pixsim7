"""
OpenAI LLM Provider Plugin

LLM provider for OpenAI GPT models (for prompt editing and AI assistance).
Auto-discovered and registered via provider plugin system.
"""

from pixsim7.backend.main.services.llm.adapters import OpenAiLlmProvider
from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind


# ===== PROVIDER MANIFEST =====

manifest = ProviderManifest(
    id="openai-llm",
    name="OpenAI GPT (LLM)",
    version="1.0.0",
    description="OpenAI GPT models for AI-assisted prompt editing and refinement",
    author="PixSim Team",
    kind=ProviderKind.LLM,
    enabled=True,
    requires_credentials=True,
)


# ===== PROVIDER INSTANCE =====

# Create provider instance (will be registered in LLM registry)
provider = OpenAiLlmProvider()


# ===== LIFECYCLE HOOKS (Optional) =====

def on_register():
    """Called when provider is registered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.openai_llm")
    logger.info("OpenAI LLM provider registered")


def on_unregister():
    """Called when provider is unregistered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.openai_llm")
    logger.info("OpenAI LLM provider unregistered")
