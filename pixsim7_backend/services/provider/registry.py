"""
Provider registry - manages available providers

Singleton pattern for provider management
"""
from typing import Dict
import logging

from pixsim7_backend.services.provider.base import Provider
from pixsim7_backend.shared.errors import ProviderNotFoundError

logger = logging.getLogger(__name__)


class ProviderRegistry:
    """
    Provider registry - manages available providers

    Usage:
        # Register provider
        registry.register(PixverseProvider())

        # Get provider
        provider = registry.get("pixverse")

        # List providers
        providers = registry.list_providers()
    """

    def __init__(self):
        self._providers: Dict[str, Provider] = {}

    def register(self, provider: Provider) -> None:
        """
        Register a provider

        Args:
            provider: Provider instance

        Example:
            registry.register(PixverseProvider())
        """
        provider_id = provider.provider_id
        self._providers[provider_id] = provider
        logger.info(f"✅ Registered provider: {provider_id}")

    def unregister(self, provider_id: str) -> None:
        """Unregister a provider"""
        if provider_id in self._providers:
            del self._providers[provider_id]
            logger.info(f"Unregistered provider: {provider_id}")

    def get(self, provider_id: str) -> Provider:
        """
        Get provider by ID

        Args:
            provider_id: Provider identifier (e.g., "pixverse")

        Returns:
            Provider instance

        Raises:
            ProviderNotFoundError: Provider not registered
        """
        if provider_id not in self._providers:
            raise ProviderNotFoundError(provider_id)

        return self._providers[provider_id]

    def has(self, provider_id: str) -> bool:
        """Check if provider is registered"""
        return provider_id in self._providers

    def list_providers(self) -> Dict[str, Provider]:
        """Get all registered providers"""
        return self._providers.copy()

    def list_provider_ids(self) -> list[str]:
        """Get all registered provider IDs"""
        return list(self._providers.keys())

    def clear(self) -> None:
        """Clear all providers (useful for testing)"""
        self._providers.clear()


# Global registry instance
registry = ProviderRegistry()


# ===== AUTO-REGISTER PROVIDERS =====

def register_default_providers() -> None:
    """
    Register default providers

    Call this on application startup
    """
    from pixsim7_backend.services.provider.adapters.pixverse import PixverseProvider
    from pixsim7_backend.services.provider.adapters.sora import SoraProvider

    # Register Pixverse
    registry.register(PixverseProvider())

    # Register Sora
    registry.register(SoraProvider())

    # TODO: Register other providers
    # registry.register(RunwayProvider())
    # registry.register(PikaProvider())

    logger.info(f"✅ Registered {len(registry.list_providers())} providers")
