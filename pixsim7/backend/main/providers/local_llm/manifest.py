"""
Local LLM Provider Plugin

LLM provider for local models (Ollama, llama.cpp, etc.) for prompt editing.
Auto-discovered and registered via provider plugin system.

NOTE: This is a stub implementation for future development.
"""

from pixsim7.backend.main.services.llm.adapters import LocalLlmProvider
from pixsim7.backend.main.shared.schemas.provider_schemas import ProviderManifest, ProviderKind


# ===== PROVIDER MANIFEST =====

manifest = ProviderManifest(
    id="local-llm",
    name="Local LLM",
    version="1.0.0",
    description="Local LLM models (Ollama, llama.cpp) for AI-assisted prompt editing",
    author="PixSim Team",
    kind=ProviderKind.LLM,
    enabled=False,  # Disabled until implemented
    requires_credentials=False,
)


# ===== PROVIDER INSTANCE =====

# Create provider instance (will be registered in LLM registry)
provider = LocalLlmProvider()


# ===== LIFECYCLE HOOKS (Optional) =====

def on_register():
    """Called when provider is registered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.local_llm")
    logger.info("Local LLM provider registered (stub)")


def on_unregister():
    """Called when provider is unregistered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.local_llm")
    logger.info("Local LLM provider unregistered")
