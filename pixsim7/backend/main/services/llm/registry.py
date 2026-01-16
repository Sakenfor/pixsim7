"""
LLM Provider Registry - manages available LLM providers for AI Hub

Similar to the video provider registry but specialized for LLM operations.
"""
from typing import TYPE_CHECKING, Optional, Protocol

from pixsim7.backend.main.lib.registry import SimpleRegistry
from pixsim7.backend.main.shared.errors import ProviderNotFoundError

if TYPE_CHECKING:
    from pixsim7.backend.main.domain.providers import ProviderAccount


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
        account: Optional["ProviderAccount"] = None,
        instance_config: dict | None = None,
    ) -> str:
        """
        Edit/refine a prompt using the LLM

        Args:
            model_id: Model to use (e.g., "gpt-4", "claude-sonnet-4")
            prompt_before: Original prompt to edit
            context: Optional context (generation metadata, user preferences, etc.)
            account: Optional provider account with credentials
            instance_config: Optional config from ProviderInstanceConfig for
                provider-specific settings (command, API key override, etc.)

        Returns:
            Edited prompt text

        Raises:
            ProviderError: LLM API error
            AuthenticationError: Invalid credentials
        """
        ...


class LlmProviderRegistry(SimpleRegistry[str, LlmProvider]):
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
        super().__init__(name="llm_providers", allow_overwrite=True)

    def _get_item_key(self, provider: LlmProvider) -> str:
        return provider.provider_id

    def register(self, provider: LlmProvider) -> None:
        """Register an LLM provider."""
        super().register(provider.provider_id, provider)

    def get(self, provider_id: str) -> LlmProvider:
        """
        Get LLM provider by ID.

        Raises:
            ProviderNotFoundError: Provider not registered
        """
        if not self.has(provider_id):
            raise ProviderNotFoundError(provider_id)
        return super().get(provider_id)

    def list_providers(self) -> dict[str, LlmProvider]:
        """Get all registered LLM providers."""
        return dict(self.items())

    def list_provider_ids(self) -> list[str]:
        """Get all registered LLM provider IDs."""
        return self.keys()


# Global LLM registry instance
llm_registry = LlmProviderRegistry()
