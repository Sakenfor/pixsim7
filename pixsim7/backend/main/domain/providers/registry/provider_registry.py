"""
Provider Registry - manages available providers

Singleton pattern for provider management with manifest-driven plugin loading.

Design:
- Manifest is the single source of truth for provider metadata
- Manifest is attached to provider instance during loading
- Providers are routed to appropriate registry based on kind (video/LLM/both)

Uses shared SimpleRegistry for core functionality.
"""
from typing import Dict, Optional, TYPE_CHECKING, Union
import logging
import os
from pathlib import Path

from pixsim7.backend.main.lib.registry import SimpleRegistry, KeyNotFoundError
from pixsim7.backend.main.shared.errors import ProviderNotFoundError

if TYPE_CHECKING:
    from pixsim7.backend.main.services.provider.base import Provider

logger = logging.getLogger(__name__)

DEFAULT_PROVIDERS_DIR = "pixsim7/backend/main/providers"
DEFAULT_PROVIDERS_MODULE = "pixsim7.backend.main.providers"
_AUTO_DISCOVERY_ATTEMPTED = False


def _resolve_providers_dir(providers_dir: str) -> Path:
    if os.path.isabs(providers_dir):
        return Path(providers_dir)

    for parent in Path(__file__).resolve().parents:
        candidate = parent / DEFAULT_PROVIDERS_DIR
        if candidate.exists():
            return (parent / providers_dir).resolve()

    return (Path.cwd() / providers_dir).resolve()


def _providers_module_base(providers_dir: str) -> str:
    normalized = providers_dir.replace("\\", "/")
    if os.path.isabs(providers_dir):
        if normalized.endswith(DEFAULT_PROVIDERS_DIR):
            return DEFAULT_PROVIDERS_MODULE
        logger.warning(
            "Providers dir is absolute; defaulting module base to %s",
            DEFAULT_PROVIDERS_MODULE,
        )
        return DEFAULT_PROVIDERS_MODULE

    if normalized == DEFAULT_PROVIDERS_DIR:
        return DEFAULT_PROVIDERS_MODULE

    return normalized.replace("/", ".").strip(".")

def _ensure_auto_discovery(reason: str) -> None:
    global _AUTO_DISCOVERY_ATTEMPTED
    if _AUTO_DISCOVERY_ATTEMPTED:
        return
    _AUTO_DISCOVERY_ATTEMPTED = True
    resolved_dir = _resolve_providers_dir(DEFAULT_PROVIDERS_DIR)
    module_base = _providers_module_base(DEFAULT_PROVIDERS_DIR)
    logger.warning(
        "Provider registry empty or missing provider; attempting auto-discovery "
        "reason=%s providers_dir=%s module_base=%s",
        reason,
        resolved_dir,
        module_base,
    )
    register_providers_from_plugins()


class ProviderRegistry(SimpleRegistry[str, "Provider"]):
    """
    Provider registry - manages available providers

    Built on SimpleRegistry for consistent registry behavior.

    Usage:
        # Register provider
        registry.register_item(PixverseProvider())

        # Get provider
        provider = registry.get("pixverse")

        # List providers
        providers = registry.list_providers()
    """

    def __init__(self):
        super().__init__(name="ProviderRegistry", log_operations=True)

    def _get_item_key(self, provider: "Provider") -> str:
        """Extract provider_id from provider instance."""
        return provider.provider_id

    def register(self, key_or_provider: Union[str, "Provider"], provider: Optional["Provider"] = None) -> None:
        """
        Register a provider (legacy API - uses register_item internally).

        Args:
            key_or_provider: Provider instance or provider_id string
            provider: Provider instance when key_or_provider is an explicit id

        Example:
            registry.register(PixverseProvider())
        """
        if provider is None:
            provider_instance = key_or_provider
            key = self._get_item_key(provider_instance)
            super().register(key, provider_instance)
        else:
            super().register(key_or_provider, provider)

    def get(self, provider_id: str) -> "Provider":
        """
        Get provider by ID

        Args:
            provider_id: Provider identifier (e.g., "pixverse")

        Returns:
            Provider instance

        Raises:
            ProviderNotFoundError: Provider not registered
        """
        try:
            return super().get(provider_id)
        except KeyNotFoundError:
            if not self._items:
                _ensure_auto_discovery("registry_empty")
            elif not _AUTO_DISCOVERY_ATTEMPTED:
                _ensure_auto_discovery("provider_missing")

            try:
                return super().get(provider_id)
            except KeyNotFoundError:
                logger.error(
                    "Provider not found after auto-discovery: provider_id=%s providers=%s",
                    provider_id,
                    list(self.keys()),
                )
                raise ProviderNotFoundError(provider_id)

    def list_providers(self) -> Dict[str, "Provider"]:
        """Get all registered providers"""
        return dict(self.items())

    def list_provider_ids(self) -> list[str]:
        """Get all registered provider IDs"""
        return self.keys()

    def get_provider_domains(self) -> dict[str, dict]:
        """
        Get provider domains dynamically from registered providers.

        Returns dict mapping provider_id to {"name": str, "domains": list[str]}

        This replaces hardcoded domain constants. Providers define their domains
        in their manifest (get_manifest().domains).
        """
        domains_map = {}

        for provider_id in self.list_provider_ids():
            try:
                provider = self.get(provider_id)

                # Try to get manifest first (preferred)
                manifest = provider.get_manifest() if hasattr(provider, 'get_manifest') else None

                if manifest and manifest.domains:
                    domains_map[provider_id] = {
                        "name": manifest.name,
                        "domains": list(manifest.domains),
                    }
                elif hasattr(provider, 'get_domains') and provider.get_domains():
                    # Fallback to get_domains() method
                    domains_map[provider_id] = {
                        "name": provider.get_display_name() if hasattr(provider, 'get_display_name') else provider_id.title(),
                        "domains": provider.get_domains(),
                    }
            except Exception:
                continue

        return domains_map


# Global registry instance
registry = ProviderRegistry()


# ===== AUTO-DISCOVER PROVIDERS =====

def discover_providers(providers_dir: str = DEFAULT_PROVIDERS_DIR) -> list[str]:
    """
    Discover provider plugins by scanning providers directory

    Args:
        providers_dir: Path to providers directory

    Returns:
        List of discovered provider IDs
    """
    discovered = []
    resolved_dir = _resolve_providers_dir(providers_dir)

    if not resolved_dir.exists():
        logger.warning("Providers directory not found: %s", resolved_dir)
        return discovered

    # Scan for provider directories
    for item in os.listdir(resolved_dir):
        provider_path = os.path.join(resolved_dir, item)

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

    logger.info("Discovered %d provider plugins: %s", len(discovered), discovered)
    return discovered


def load_provider_plugin(provider_name: str, providers_dir: str = DEFAULT_PROVIDERS_DIR) -> bool:
    """
    Load and register a provider plugin

    Supports both video and LLM providers - routes to appropriate registry based on kind.

    The manifest is attached to the provider instance during loading, making it
    the single source of truth for provider metadata.

    Args:
        provider_name: Provider directory name
        providers_dir: Path to providers directory

    Returns:
        True if loaded successfully, False otherwise
    """
    import importlib

    try:
        # Build module path
        module_base = _providers_module_base(providers_dir)
        module_path = f"{module_base}.{provider_name}.manifest"

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
        else:
            # Attach manifest to provider instance (SINGLE SOURCE OF TRUTH)
            # This ensures adapters don't need to duplicate metadata
            provider_instance._manifest = manifest
            logger.debug(f"Attached manifest to provider {provider_name}")

        # Check if enabled
        if manifest and hasattr(manifest, 'enabled') and not manifest.enabled:
            logger.info(f"Provider plugin {provider_name} is disabled, skipping")
            return False

        # Register provider based on kind
        if manifest and hasattr(manifest, 'kind'):
            from pixsim7.backend.main.domain.providers.schemas import ProviderKind

            if manifest.kind == ProviderKind.LLM:
                # Register LLM provider in LLM registry
                from pixsim7.backend.main.services.llm.registry import llm_registry
                llm_registry.register(provider_instance)
            elif manifest.kind == ProviderKind.EMBEDDING:
                # Register embedding provider in embedding registry
                from pixsim7.backend.main.services.embedding.registry import embedding_registry
                embedding_registry.register(provider_instance)
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


def register_providers_from_plugins(providers_dir: str = DEFAULT_PROVIDERS_DIR) -> int:
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

    logger.info(f"Registered {registered_count} provider plugins")
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
