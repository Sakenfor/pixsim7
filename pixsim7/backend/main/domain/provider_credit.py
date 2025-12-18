"""
ProviderCredit domain model - normalized credit tracking

BACKWARD COMPATIBILITY NOTICE:
This file now re-exports from domain/providers/models/ for backward compatibility.
New code should import from:
    from pixsim7.backend.main.domain.providers import ProviderCredit

Or directly:
    from pixsim7.backend.main.domain.providers.models import ProviderCredit
"""

# Re-export from new canonical location
from pixsim7.backend.main.domain.providers.models.credit import ProviderCredit

__all__ = ["ProviderCredit"]
