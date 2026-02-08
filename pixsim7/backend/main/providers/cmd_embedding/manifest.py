"""
Command Embedding Provider Plugin

Embedding provider that executes a local CLI command.
Auto-discovered and registered via provider plugin system.

Configuration:
    Set these environment variables to configure the provider:
    - CMD_EMBEDDING_COMMAND: The base command to execute (required)
    - CMD_EMBEDDING_TIMEOUT: Timeout in seconds (default: 120)

Command Contract:
    Input JSON (via stdin):
        {"task": "embed_texts", "texts": ["..."], "model": "..."}

    Output JSON (via stdout):
        {"embeddings": [[0.1, 0.2, ...], ...]}
"""

from pixsim7.backend.main.services.embedding.adapters import CommandEmbeddingProvider
from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind


# ===== PROVIDER MANIFEST =====

manifest = ProviderManifest(
    id="cmd-embedding",
    name="Command Embedding",
    version="1.0.0",
    description="Embedding provider that runs a local CLI command for generating text embeddings",
    author="PixSim Team",
    kind=ProviderKind.EMBEDDING,
    enabled=True,
    requires_credentials=False,
)


# ===== PROVIDER INSTANCE =====

provider = CommandEmbeddingProvider()


# ===== LIFECYCLE HOOKS =====

def on_register():
    """Called when provider is registered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.cmd_embedding")
    logger.info("Command Embedding provider registered")


def on_unregister():
    """Called when provider is unregistered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.cmd_embedding")
    logger.info("Command Embedding provider unregistered")
