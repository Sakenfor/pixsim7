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
- GenerationTrackingService: Read-only facade for unified generation provenance
- GenerationStepExecutor: Submit + await completion (reusable atom for sequential execution)
- ChainExecutor: Sequential execution of GenerationChain pipelines
"""

# Main service (backward compatibility)
from .service import GenerationService

# Focused services (for direct use if needed)
from .creation import GenerationCreationService
from .lifecycle import GenerationLifecycleService
from .query import GenerationQueryService
from .retry import GenerationRetryService
from .billing import GenerationBillingService
from .tracking import GenerationTrackingService
from .step_executor import GenerationStepExecutor, StepResult, StepTimeoutError, StepFailedError
from .chain_executor import ChainExecutor, ChainExecutionResult

__all__ = [
    "GenerationService",  # Main service (backward compatible)
    "GenerationCreationService",
    "GenerationLifecycleService",
    "GenerationQueryService",
    "GenerationRetryService",
    "GenerationBillingService",
    "GenerationTrackingService",
    "GenerationStepExecutor",
    "StepResult",
    "StepTimeoutError",
    "StepFailedError",
    "ChainExecutor",
    "ChainExecutionResult",
]
