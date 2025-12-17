"""
Pixverse Provider Plugin

Video generation provider for Pixverse AI.
Auto-discovered and registered via provider plugin system.
"""

from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
from pixsim7.backend.main.shared.schemas.provider_schemas import ProviderManifest, ProviderKind


# ===== PROVIDER MANIFEST =====

manifest = ProviderManifest(
    id="pixverse",
    name="Pixverse AI",
    version="1.0.0",
    description="Pixverse AI video generation provider supporting text-to-video, image-to-video, video extension, transitions, and fusion",
    author="PixSim Team",
    kind=ProviderKind.VIDEO,
    enabled=True,
    requires_credentials=True,
    domains=["pixverse.ai", "app.pixverse.ai"],
    credit_types=["web", "openapi"],  # Pixverse has both web (free) and openapi (paid) credits
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
