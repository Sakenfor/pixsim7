"""
Job services - job lifecycle management

DEPRECATED: This package is maintained for backward compatibility.
Use pixsim7_backend.services.generation.GenerationService instead.
"""
from pixsim7_backend.services.generation import GenerationService

# Backward compatibility alias
JobService = GenerationService

__all__ = [
    "JobService",  # Deprecated alias for GenerationService
    "GenerationService",
]
