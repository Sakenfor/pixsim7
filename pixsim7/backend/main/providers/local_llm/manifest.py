"""
Local LLM Provider Plugin

LLM provider for local GGUF models via llama-cpp-python.
Auto-discovered and registered via provider plugin system.
"""

from pixsim7.backend.main.services.llm.adapters import LocalLlmProvider
from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind


# ===== PROVIDER MANIFEST =====

manifest = ProviderManifest(
    id="local-llm",
    name="Local LLM",
    version="1.0.0",
    description="Local GGUF inference (llama-cpp-python) for prompt analysis and editing",
    author="PixSim Team",
    kind=ProviderKind.LLM,
    enabled=True,
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
    logger.info("Local LLM provider registered")


def on_unregister():
    """Called when provider is unregistered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.local_llm")
    logger.info("Local LLM provider unregistered")
