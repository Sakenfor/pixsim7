"""
Pixverse Provider Plugin

Video generation provider for Pixverse AI.
Auto-discovered and registered via provider plugin system.
"""

from pydantic import BaseModel
from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider


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
    id="pixverse",
    name="Pixverse AI",
    version="1.0.0",
    description="Pixverse AI video generation provider supporting text-to-video, image-to-video, video extension, transitions, and fusion",
    author="PixSim Team",
    enabled=True,
    requires_credentials=True,
)


# ===== PROVIDER INSTANCE =====

# Create provider instance (will be registered automatically)
provider = PixverseProvider()


# ===== LIFECYCLE HOOKS (Optional) =====

def on_register():
    """Called when provider is registered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.pixverse")
    logger.info("Pixverse provider registered")


def on_unregister():
    """Called when provider is unregistered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.pixverse")
    logger.info("Pixverse provider unregistered")
