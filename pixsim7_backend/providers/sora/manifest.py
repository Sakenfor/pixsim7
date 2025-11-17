"""
Sora Provider Plugin

Video generation provider for OpenAI Sora.
Auto-discovered and registered via provider plugin system.
"""

from pydantic import BaseModel
from pixsim7_backend.services.provider.adapters.sora import SoraProvider


# ===== PROVIDER MANIFEST =====

class ProviderManifest(BaseModel):
    """Manifest for provider plugins"""
    id: str
    name: str
    version: str
    description: str
    author: str
    enabled: bool = True
    requires_credentials: bool = True


manifest = ProviderManifest(
    id="sora",
    name="OpenAI Sora",
    version="1.0.0",
    description="OpenAI Sora video generation provider supporting text-to-video and image-to-video",
    author="PixSim Team",
    enabled=True,
    requires_credentials=True,
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
