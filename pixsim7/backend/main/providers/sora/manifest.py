"""
Sora Provider Plugin

Video generation provider for OpenAI Sora.
Auto-discovered and registered via provider plugin system.
"""

from pixsim7.backend.main.services.provider.adapters.sora import SoraProvider
from pixsim7.backend.main.shared.schemas.provider_schemas import ProviderManifest, ProviderKind


# ===== PROVIDER MANIFEST =====

manifest = ProviderManifest(
    id="sora",
    name="OpenAI Sora",
    version="1.0.0",
    description="OpenAI Sora video generation provider supporting text-to-video and image-to-video",
    author="PixSim Team",
    kind=ProviderKind.VIDEO,
    enabled=True,
    requires_credentials=True,
    domains=["sora.chatgpt.com", "sora.com", "chatgpt.com"],
    credit_types=["standard"],  # Sora uses standard credits
)


# ===== PROVIDER INSTANCE =====

# Create provider instance (will be registered automatically)
provider = SoraProvider()


# ===== LIFECYCLE HOOKS (Optional) =====

def on_register():
    """Called when provider is registered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.sora")
    logger.info("Sora provider registered")


def on_unregister():
    """Called when provider is unregistered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.sora")
    logger.info("Sora provider unregistered")
