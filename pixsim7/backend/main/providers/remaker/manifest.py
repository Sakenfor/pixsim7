"""
Remaker Provider Plugin

Image inpainting provider for Remaker.ai (web internal API).
Auto-discovered and registered via provider plugin system.
"""

from pixsim7.backend.main.services.provider.adapters.remaker import RemakerProvider
from pixsim7.backend.main.shared.schemas.provider_schemas import ProviderKind, ProviderManifest


manifest = ProviderManifest(
    id="remaker",
    name="Remaker.ai",
    version="0.1.0",
    description="Remaker.ai inpainting provider (web internal API replay)",
    author="PixSim7",
    kind=ProviderKind.VIDEO,
    enabled=True,
    requires_credentials=True,
)


provider = RemakerProvider()


def on_register():
    from pixsim_logging import configure_logging

    logger = configure_logging("provider.remaker")
    logger.info("Remaker provider registered")

