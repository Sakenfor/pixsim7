"""
Remaker Provider Plugin

Image inpainting provider for Remaker.ai (web internal API).
Auto-discovered and registered via provider plugin system.

This is an example of a "web internal API" provider that replays browser requests.
See the adapter (services/provider/adapters/remaker.py) for implementation details.
"""

from pixsim7.backend.main.services.provider.adapters.remaker import RemakerProvider
from pixsim7.backend.main.shared.schemas.provider_schemas import ProviderKind, ProviderManifest


# ===== PROVIDER MANIFEST =====
# This manifest defines all metadata for the provider plugin.
# The domains field enables automatic URL detection in the frontend.
# The credit_types field enables proper credit tracking.

manifest = ProviderManifest(
    id="remaker",
    name="Remaker.ai",
    version="0.1.0",
    description="Remaker.ai inpainting provider (web internal API replay)",
    author="PixSim7",
    kind=ProviderKind.VIDEO,
    enabled=True,
    requires_credentials=True,
    # Domains for URL detection (extension detects when user is on these sites)
    domains=["remaker.ai", "api.remaker.ai"],
    # Credit types supported by this provider
    credit_types=["web"],
    # Notes on status code mapping for developers
    status_mapping_notes="100000=success/completed, 300006=processing, other codes=failed",
)


# ===== PROVIDER INSTANCE =====
provider = RemakerProvider()


# ===== LIFECYCLE HOOKS =====
def on_register():
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.remaker")
    logger.info("Remaker provider registered")

