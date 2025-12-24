"""
Pixverse Provider Plugin

Video generation provider for Pixverse AI.
Auto-discovered and registered via provider plugin system.

Supports operations:
- TEXT_TO_VIDEO, IMAGE_TO_VIDEO, VIDEO_EXTEND, VIDEO_TRANSITION, FUSION (video)
- TEXT_TO_IMAGE, IMAGE_TO_IMAGE (image)

Credit types:
- web: Free tier credits
- openapi: OpenAPI/paid tier credits
- standard: Standard/subscription credits
"""

from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind


# ===== PROVIDER MANIFEST =====
# This manifest defines all metadata for the provider plugin.
# The domains field enables automatic URL detection in the frontend.
# The credit_types field enables proper credit tracking.

manifest = ProviderManifest(
    id="pixverse",
    name="Pixverse AI",
    version="1.0.0",
    description="Pixverse AI video and image generation provider",
    author="PixSim Team",
    kind=ProviderKind.VIDEO,
    enabled=True,
    requires_credentials=True,
    # Domains for URL detection (extension detects when user is on these sites)
    domains=["pixverse.ai", "app.pixverse.ai"],
    # Credit types supported by this provider (web=free, openapi=paid, standard=subscription)
    credit_types=["web", "openapi", "standard"],
    cost_estimator={
        "endpoint": "/providers/pixverse/estimate-cost",
        "method": "POST",
        "payload_keys": [
            "model",
            "quality",
            "duration",
            "motion_mode",
            "multi_shot",
            "audio",
            "api_method",
        ],
        "required_keys": ["model", "quality"],
        "include_operation_type": False,
    },
    # Notes on status code mapping for developers
    status_mapping_notes=(
        "1=success/completed, 2=processing, "
        "4/7=failed (transient, may retry), 5=filtered (may retry), "
        "6=filtered (prompt blocked, no retry)"
    ),
)


# ===== PROVIDER INSTANCE =====
provider = PixverseProvider()


# ===== LIFECYCLE HOOKS =====
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
