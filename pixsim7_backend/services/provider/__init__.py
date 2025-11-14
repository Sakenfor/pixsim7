"""
Provider services

Provider abstraction and registry
"""
from .base import (
    Provider,
    GenerationResult,
    VideoStatusResult,
    ProviderError,
    AuthenticationError,
    QuotaExceededError,
    ContentFilteredError,
    JobNotFoundError,
    RateLimitError,
    UnsupportedOperationError,
)
from .registry import registry, register_default_providers
from .adapters import PixverseProvider
from .provider_service import ProviderService

__all__ = [
    # Base classes
    "Provider",
    "GenerationResult",
    "VideoStatusResult",
    # Errors
    "ProviderError",
    "AuthenticationError",
    "QuotaExceededError",
    "ContentFilteredError",
    "JobNotFoundError",
    "RateLimitError",
    "UnsupportedOperationError",
    # Registry
    "registry",
    "register_default_providers",
    # Providers
    "PixverseProvider",
    # High-level services
    "ProviderService",
]
