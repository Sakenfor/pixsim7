"""
OpenAI Embedding Provider Plugin

Embedding provider for OpenAI text-embedding-3-* models.
Auto-discovered and registered via provider plugin system.
"""

from pixsim7.backend.main.services.embedding.adapters import OpenAiEmbeddingProvider
from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind


# ===== PROVIDER MANIFEST =====

manifest = ProviderManifest(
    id="openai-embedding",
    name="OpenAI Embedding",
    version="1.0.0",
    description="OpenAI text embedding models for semantic similarity search",
    author="PixSim Team",
    kind=ProviderKind.EMBEDDING,
    enabled=True,
    requires_credentials=True,
)


# ===== PROVIDER INSTANCE =====

provider = OpenAiEmbeddingProvider()


# ===== LIFECYCLE HOOKS =====

def on_register():
    """Called when provider is registered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.openai_embedding")
    logger.info("OpenAI Embedding provider registered")


def on_unregister():
    """Called when provider is unregistered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.openai_embedding")
    logger.info("OpenAI Embedding provider unregistered")
