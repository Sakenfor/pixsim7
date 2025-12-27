"""
Generation Services

Split into focused services for better maintainability and AI agent navigation.

Services:
- GenerationService: Backward compatibility layer (composes all services)
- GenerationCreationService: Creation, validation, canonicalization
- GenerationLifecycleService: Status transitions
- GenerationQueryService: Retrieval and listing
- GenerationRetryService: Retry logic
- GenerationBillingService: Credit deduction and billing finalization
"""

# Main service (backward compatibility)
from .service import GenerationService

# Focused services (for direct use if needed)
from .creation import GenerationCreationService
from .lifecycle import GenerationLifecycleService
from .query import GenerationQueryService
from .retry import GenerationRetryService
from .billing import GenerationBillingService

__all__ = [
    "GenerationService",  # Main service (backward compatible)
    "GenerationCreationService",
    "GenerationLifecycleService",
    "GenerationQueryService",
    "GenerationRetryService",
    "GenerationBillingService",
]
