"""
ProviderAccount domain model - provider credentials and account pool

BACKWARD COMPATIBILITY NOTICE:
This file now re-exports from domain/providers/models/ for backward compatibility.
New code should import from:
    from pixsim7.backend.main.domain.providers import ProviderAccount

Or directly:
    from pixsim7.backend.main.domain.providers.models import ProviderAccount
"""

# Re-export from new canonical location
from pixsim7.backend.main.domain.providers.models.account import (
    ProviderAccount,
    normalize_email_before_save,
)

__all__ = ["ProviderAccount", "normalize_email_before_save"]
