"""
ProviderSubmission model - THE source of truth for provider interactions

BACKWARD COMPATIBILITY NOTICE:
This file now re-exports from domain/providers/models/ for backward compatibility.
New code should import from:
    from pixsim7.backend.main.domain.providers import ProviderSubmission

Or directly:
    from pixsim7.backend.main.domain.providers.models import ProviderSubmission
"""

# Re-export from new canonical location
from pixsim7.backend.main.domain.providers.models.submission import ProviderSubmission

__all__ = ["ProviderSubmission"]
