"""
Providers Domain
================

Single source of truth for provider lifecycle, metadata, and credits.

This domain package owns:
- Provider accounts + auth/session data shapes
- Credit types + credit accounting semantics
- Provider manifests/metadata (domains, capabilities, credit types)
- Provider registry + plugin loading/wiring
- Common provider execution hooks (file prep, mapping, status mapping, retries)

Design Principles:
- Manifest-driven: Plugin manifest.py is the single source of truth for static metadata
- No duplication: Credit rules and domain mappings come from one place
- Clean separation: Domain owns data shapes; services own business logic
- Plugin-friendly: Adding new providers doesn't require touching multiple layers

Import Conventions:
    # Models (database-backed)
    from pixsim7.backend.main.domain.providers import (
        ProviderAccount,
        ProviderCredit,
        ProviderSubmission,
    )

    # Schemas (data shapes)
    from pixsim7.backend.main.domain.providers.schemas import (
        ProviderManifest,
        ProviderKind,
        CreditType,
    )

    # Registry (provider discovery/loading)
    from pixsim7.backend.main.domain.providers.registry import (
        registry,
        register_default_providers,
    )

    # Credit utilities
    from pixsim7.backend.main.domain.providers.credits import (
        CreditSemantics,
        is_valid_credit_type,
        get_usable_credits,
    )

    # Execution helpers
    from pixsim7.backend.main.domain.providers.execution import (
        StatusMapper,
        FileResolver,
    )

Adding a New Provider:
    1. Create pixsim7/backend/main/providers/{provider_name}/manifest.py
    2. Define ProviderManifest with id, name, domains, credit_types
    3. Create provider adapter implementing the Provider interface
    4. Export 'provider' instance and 'manifest' from manifest.py
    5. Optional: Add on_register() / on_unregister() hooks

See docs/systems/generation/adding-providers.md for detailed guide.
"""

# Models (re-export from models subpackage)
from .models import (
    ProviderAccount,
    ProviderCredit,
    ProviderSubmission,
    LlmProviderInstance,
)

# Schemas (re-export core schemas)
from .schemas import (
    ProviderManifest,
    ProviderKind,
)

# Registry (re-export registry functions)
from .registry import (
    registry,
    register_default_providers,
    register_providers_from_plugins,
    discover_providers,
    load_provider_plugin,
)

# Credits (re-export credit utilities)
from .credits import (
    CreditSemantics,
    is_valid_credit_type,
    get_usable_credits,
    get_credit_display_name,
)

__all__ = [
    # Models
    "ProviderAccount",
    "ProviderCredit",
    "ProviderSubmission",
    "LlmProviderInstance",
    # Schemas
    "ProviderManifest",
    "ProviderKind",
    # Registry
    "registry",
    "register_default_providers",
    "register_providers_from_plugins",
    "discover_providers",
    "load_provider_plugin",
    # Credits
    "CreditSemantics",
    "is_valid_credit_type",
    "get_usable_credits",
    "get_credit_display_name",
]
