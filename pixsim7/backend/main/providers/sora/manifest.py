"""
Sora Provider Plugin

Video generation provider for OpenAI Sora.
Auto-discovered and registered via provider plugin system.

Supports operations:
- TEXT_TO_VIDEO, IMAGE_TO_VIDEO

Note: Sora uses OpenAI's subscription/usage model, not discrete credits.
"""

from pixsim7.backend.main.services.provider.adapters.sora import SoraProvider
from pixsim7.backend.main.shared.schemas.provider_schemas import ProviderManifest, ProviderKind


# ===== PROVIDER MANIFEST =====
# This manifest defines all metadata for the provider plugin.
# The domains field enables automatic URL detection in the frontend.

manifest = ProviderManifest(
    id="sora",
    name="OpenAI Sora",
    version="1.0.0",
    description="OpenAI Sora video generation provider",
    author="PixSim Team",
    kind=ProviderKind.VIDEO,
    enabled=True,
    requires_credentials=True,
    # Domains for URL detection
    domains=["sora.chatgpt.com", "sora.com", "chatgpt.com"],
    # Sora uses OpenAI's usage model (not discrete credits)
    credit_types=["usage"],
    # Notes on status mapping
    status_mapping_notes="polling-based: PROCESSING while generating, COMPLETED when done",
)


# ===== PROVIDER INSTANCE =====
provider = SoraProvider()


# ===== LIFECYCLE HOOKS =====
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
