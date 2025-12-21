"""
LLM Provider Registry - manages available LLM providers for AI Hub

Similar to the video provider registry but specialized for LLM operations.
"""
from typing import Dict, Protocol
import logging

from pixsim7.backend.main.shared.errors import ProviderNotFoundError

logger = logging.getLogger(__name__)


class LlmProvider(Protocol):
    """
    Protocol for LLM providers

    Each LLM provider (OpenAI, Anthropic, local) implements this interface.
    This is separate from the video Provider interface.
    """

    @property
    def provider_id(self) -> str:
        """Provider identifier (e.g., 'openai-llm', 'anthropic-llm')"""
        ...

    async def edit_prompt(
        self,
        *,
        model_id: str,
        prompt_before: str,
        context: dict | None = None,
        instance_config: dict | None = None,
    ) -> str:
        """
        Edit/refine a prompt using the LLM

        Args:
            model_id: Model to use (e.g., "gpt-4", "claude-sonnet-4")
            prompt_before: Original prompt to edit
            context: Optional context (generation metadata, user preferences, etc.)
            instance_config: Optional config from LlmProviderInstance for
                provider-specific settings (command, API key override, etc.)

        Returns:
            Edited prompt text

        Raises:
            ProviderError: LLM API error
            AuthenticationError: Invalid credentials
        """
        ...


class LlmProviderRegistry:
    """
    LLM Provider registry - manages available LLM providers

    Similar to video provider registry but for LLM operations.

    Usage:
        # Register LLM provider
        registry.register(OpenAiLlmProvider())

        # Get LLM provider
        provider = registry.get("openai-llm")

        # List LLM providers
        providers = registry.list_providers()
    """

    def __init__(self):
        self._providers: Dict[str, LlmProvider] = {}

    def register(self, provider: LlmProvider) -> None:
        """
        Register an LLM provider

        Args:
            provider: LLM provider instance

        Example:
            registry.register(OpenAiLlmProvider())
        """
        provider_id = provider.provider_id
        self._providers[provider_id] = provider
        logger.info(f"✅ Registered LLM provider: {provider_id}")

    def unregister(self, provider_id: str) -> None:
        """Unregister an LLM provider"""
        if provider_id in self._providers:
            del self._providers[provider_id]
            logger.info(f"Unregistered LLM provider: {provider_id}")

    def get(self, provider_id: str) -> LlmProvider:
        """
        Get LLM provider by ID

        Args:
            provider_id: Provider identifier (e.g., "openai-llm")

        Returns:
            LLM provider instance

        Raises:
            ProviderNotFoundError: Provider not registered
        """
        if provider_id not in self._providers:
            raise ProviderNotFoundError(provider_id)

        return self._providers[provider_id]

    def has(self, provider_id: str) -> bool:
        """Check if LLM provider is registered"""
        return provider_id in self._providers

    def list_providers(self) -> Dict[str, LlmProvider]:
        """Get all registered LLM providers"""
        return self._providers.copy()

    def list_provider_ids(self) -> list[str]:
        """Get all registered LLM provider IDs"""
        return list(self._providers.keys())

    def clear(self) -> None:
        """Clear all LLM providers (useful for testing)"""
        self._providers.clear()


# Global LLM registry instance
llm_registry = LlmProviderRegistry()
