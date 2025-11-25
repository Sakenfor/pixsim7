"""
Provider registry - manages available providers

Singleton pattern for provider management
"""
from typing import Dict
import logging

from pixsim7.backend.main.services.provider.base import Provider
from pixsim7.backend.main.shared.errors import ProviderNotFoundError

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


# ===== AUTO-DISCOVER PROVIDERS =====

def discover_providers(providers_dir: str = "pixsim7/backend/main/providers") -> list[str]:
    """
    Discover provider plugins by scanning providers directory

    Args:
        providers_dir: Path to providers directory

    Returns:
        List of discovered provider IDs
    """
    import os

    discovered = []

    if not os.path.exists(providers_dir):
        logger.warning(f"Providers directory not found: {providers_dir}")
        return discovered

    # Scan for provider directories
    for item in os.listdir(providers_dir):
        provider_path = os.path.join(providers_dir, item)

        # Skip if not a directory
        if not os.path.isdir(provider_path):
            continue

        # Skip __pycache__ and hidden directories
        if item.startswith('_') or item.startswith('.'):
            continue

        # Check for manifest.py
        manifest_path = os.path.join(provider_path, "manifest.py")
        if not os.path.exists(manifest_path):
            logger.debug(f"Skipping {item} - no manifest.py found")
            continue

        discovered.append(item)

    logger.info(f"Discovered {len(discovered)} provider plugins: {discovered}")
    return discovered


def load_provider_plugin(provider_name: str, providers_dir: str = "pixsim7/backend/main/providers") -> bool:
    """
    Load and register a provider plugin

    Supports both video and LLM providers - routes to appropriate registry based on kind.

    Args:
        provider_name: Provider directory name
        providers_dir: Path to providers directory

    Returns:
        True if loaded successfully, False otherwise
    """
    import importlib

    try:
        # Build module path
        module_path = f"{providers_dir.replace('/', '.')}.{provider_name}.manifest"

        # Import manifest module
        module = importlib.import_module(module_path)

        # Get provider instance and manifest
        provider_instance = getattr(module, 'provider', None)
        manifest = getattr(module, 'manifest', None)

        if not provider_instance:
            logger.error(f"Provider plugin {provider_name} has no 'provider' instance")
            return False

        if not manifest:
            logger.warning(f"Provider plugin {provider_name} has no manifest")

        # Check if enabled
        if manifest and hasattr(manifest, 'enabled') and not manifest.enabled:
            logger.info(f"Provider plugin {provider_name} is disabled, skipping")
            return False

        # Register provider based on kind
        if manifest and hasattr(manifest, 'kind'):
            from pixsim7.backend.main.shared.schemas.provider_schemas import ProviderKind

            if manifest.kind == ProviderKind.LLM:
                # Register LLM provider in LLM registry
                from pixsim7.backend.main.services.llm.registry import llm_registry
                llm_registry.register(provider_instance)
            elif manifest.kind in (ProviderKind.VIDEO, ProviderKind.BOTH):
                # Register video provider in video registry
                registry.register(provider_instance)

                # If BOTH, also register in LLM registry
                if manifest.kind == ProviderKind.BOTH:
                    from pixsim7.backend.main.services.llm.registry import llm_registry
                    llm_registry.register(provider_instance)
            else:
                logger.warning(f"Unknown provider kind for {provider_name}: {manifest.kind}")
                return False
        else:
            # No kind specified - assume video provider (backward compatibility)
            logger.warning(f"Provider {provider_name} has no 'kind' in manifest, assuming VIDEO")
            registry.register(provider_instance)

        # Call on_register hook if exists
        on_register = getattr(module, 'on_register', None)
        if callable(on_register):
            on_register()

        return True

    except Exception as e:
        logger.error(f"Failed to load provider plugin {provider_name}: {e}", exc_info=True)
        return False


def register_providers_from_plugins(providers_dir: str = "pixsim7/backend/main/providers") -> int:
    """
    Auto-discover and register all provider plugins

    Args:
        providers_dir: Path to providers directory

    Returns:
        Number of providers registered
    """
    discovered = discover_providers(providers_dir)

    registered_count = 0
    for provider_name in discovered:
        if load_provider_plugin(provider_name, providers_dir):
            registered_count += 1

    logger.info(f"✅ Registered {registered_count} provider plugins")
    return registered_count


# ===== LEGACY MANUAL REGISTRATION (Deprecated) =====

def register_default_providers() -> None:
    """
    Register default providers (DEPRECATED - use register_providers_from_plugins)

    This function is kept for backward compatibility but now uses auto-discovery.
    Call this on application startup.
    """
    # Use auto-discovery instead of manual registration
    register_providers_from_plugins()

    # Legacy code (commented out - now handled by plugin system):
    # from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
    # from pixsim7.backend.main.services.provider.adapters.sora import SoraProvider
    # registry.register(PixverseProvider())
    # registry.register(SoraProvider())
