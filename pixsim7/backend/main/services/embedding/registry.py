"""
Embedding Provider Registry - manages available embedding providers

Mirrors the LlmProviderRegistry pattern for consistent plugin architecture.
"""
from typing import TYPE_CHECKING, Optional, Protocol

from pixsim7.backend.main.lib.registry import SimpleRegistry
from pixsim7.backend.main.shared.errors import ProviderNotFoundError

if TYPE_CHECKING:
    from pixsim7.backend.main.domain.providers import ProviderAccount


class EmbeddingProvider(Protocol):
    """
    Protocol for embedding providers.

    Each embedding provider (OpenAI, local command) implements this interface.
    """

    @property
    def provider_id(self) -> str:
        """Provider identifier (e.g., 'openai-embedding', 'cmd-embedding')"""
        ...

    @property
    def default_dimensions(self) -> int:
        """Default embedding dimensions produced by this provider."""
        ...

    async def embed_texts(
        self,
        *,
        model_id: str,
        texts: list[str],
        account: Optional["ProviderAccount"] = None,
        instance_config: dict | None = None,
    ) -> list[list[float]]:
        """
        Generate embeddings for a list of texts.

        Args:
            model_id: Model to use (e.g., "text-embedding-3-small")
            texts: List of texts to embed
            account: Optional provider account with credentials
            instance_config: Optional config from ProviderInstanceConfig

        Returns:
            List of embedding vectors (one per input text)

        Raises:
            ProviderError: Embedding API error
            ProviderAuthenticationError: Invalid credentials
        """
        ...


class EmbeddingProviderRegistry(SimpleRegistry[str, EmbeddingProvider]):
    """
    Embedding Provider registry - manages available embedding providers.

    Mirrors LlmProviderRegistry for consistent architecture.
    """

    def __init__(self):
        super().__init__(name="embedding_providers", allow_overwrite=True)

    def _get_item_key(self, provider: EmbeddingProvider) -> str:
        return provider.provider_id

    def register(self, provider: EmbeddingProvider) -> None:
        """Register an embedding provider."""
        super().register(provider.provider_id, provider)

    def get(self, provider_id: str) -> EmbeddingProvider:
        """
        Get embedding provider by ID.

        Raises:
            ProviderNotFoundError: Provider not registered
        """
        if not self.has(provider_id):
            raise ProviderNotFoundError(provider_id)
        return super().get(provider_id)

    def list_providers(self) -> dict[str, EmbeddingProvider]:
        """Get all registered embedding providers."""
        return dict(self.items())

    def list_provider_ids(self) -> list[str]:
        """Get all registered embedding provider IDs."""
        return self.keys()


# Global embedding registry instance
embedding_registry = EmbeddingProviderRegistry()
