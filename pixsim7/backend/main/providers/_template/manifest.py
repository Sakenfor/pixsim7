"""
Template Provider Plugin

INSTRUCTIONS:
1. Copy this file to providers/<yourprovider>/manifest.py
2. Update the manifest with your provider's metadata
3. Create the adapter in services/provider/adapters/<yourprovider>.py
4. Import your provider class below

See /docs/systems/generation/adding-providers.md for details.
"""

# TODO: Import your provider adapter
# from pixsim7.backend.main.services.provider.adapters.myprovider import MyProvider
from pixsim7.backend.main.shared.schemas.provider_schemas import ProviderManifest, ProviderKind


# ===== PROVIDER MANIFEST =====
# This manifest defines all metadata for the provider plugin.
# The domains field enables automatic URL detection in the frontend.
# The credit_types field enables proper credit tracking.

manifest = ProviderManifest(
    # Required: Unique provider identifier (lowercase, no spaces)
    id="myprovider",

    # Required: Human-readable display name
    name="My Provider",

    # Required: Semantic version
    version="1.0.0",

    # Required: Brief description
    description="Description of my provider",

    # Required: Author/maintainer
    author="Your Name",

    # Required: Provider kind (VIDEO, LLM, or BOTH)
    kind=ProviderKind.VIDEO,

    # Optional: Set to False to disable provider
    enabled=True,

    # Optional: Whether provider needs account credentials
    requires_credentials=True,

    # Domains for URL detection (extension detects when user is on these sites)
    # This enables automatic provider detection in the browser extension
    domains=["myprovider.ai", "app.myprovider.ai"],

    # Credit types supported by this provider
    # Used by billing system to track credits properly
    credit_types=["web"],

    # Notes on status code mapping for developers
    # Document how your provider's status codes map to ProviderStatus
    status_mapping_notes="1=completed, 2=processing, 3=failed",
)


# ===== PROVIDER INSTANCE =====
# TODO: Uncomment and update when adapter is ready
# provider = MyProvider()

# Placeholder for template - remove when implementing
class _PlaceholderProvider:
    provider_id = "myprovider"
    supported_operations = []

provider = _PlaceholderProvider()


# ===== LIFECYCLE HOOKS (Optional) =====
def on_register():
    """Called when provider is registered on startup."""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.myprovider")
    logger.info("MyProvider registered")


def on_unregister():
    """Called when provider is unregistered (rarely used)."""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.myprovider")
    logger.info("MyProvider unregistered")
