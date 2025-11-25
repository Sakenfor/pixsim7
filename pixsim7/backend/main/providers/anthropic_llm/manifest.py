"""
Anthropic LLM Provider Plugin

LLM provider for Anthropic Claude models (for prompt editing and AI assistance).
Auto-discovered and registered via provider plugin system.
"""

from pixsim7.backend.main.services.llm.adapters import AnthropicLlmProvider
from pixsim7.backend.main.shared.schemas.provider_schemas import ProviderManifest, ProviderKind


# ===== PROVIDER MANIFEST =====

manifest = ProviderManifest(
    id="anthropic-llm",
    name="Anthropic Claude (LLM)",
    version="1.0.0",
    description="Anthropic Claude models for AI-assisted prompt editing and refinement",
    author="PixSim Team",
    kind=ProviderKind.LLM,
    enabled=True,
    requires_credentials=True,
)


# ===== PROVIDER INSTANCE =====

# Create provider instance (will be registered in LLM registry)
provider = AnthropicLlmProvider()


# ===== LIFECYCLE HOOKS (Optional) =====

def on_register():
    """Called when provider is registered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.anthropic_llm")
    logger.info("Anthropic LLM provider registered")


def on_unregister():
    """Called when provider is unregistered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.anthropic_llm")
    logger.info("Anthropic LLM provider unregistered")
