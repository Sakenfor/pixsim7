"""
LLM Method Registry - manages delivery method adapters for AI Hub.

Adapters are keyed by (method, provider) compound:
  - ("api", "openai")     → OpenAI SDK
  - ("api", "anthropic")  → Anthropic SDK
  - ("cmd", None)         → local subprocess
  - ("remote", None)      → WebSocket bridge
  - ("local", None)       → llama-cpp engine

Legacy provider_id keys (e.g. "openai-llm") are supported via alias mapping
for backward compatibility during migration.
"""
from typing import TYPE_CHECKING, Optional, Protocol

from pixsim7.backend.main.lib.registry import SimpleRegistry
from pixsim7.backend.main.shared.errors import ProviderNotFoundError

if TYPE_CHECKING:
    from pixsim7.backend.main.domain.providers import ProviderAccount


class LlmProvider(Protocol):
    """
    Protocol for LLM delivery method adapters.

    Each adapter implements this interface. The adapter handles a specific
    delivery method (api, cmd, remote, local) and optionally a specific
    provider (openai, anthropic).
    """

    @property
    def provider_id(self) -> str:
        """Legacy provider identifier (e.g., 'openai-llm', 'cmd-llm').

        Used for backward compatibility. New code should use method + provider.
        """
        ...

    @property
    def method(self) -> str:
        """Delivery method: 'api', 'cmd', 'remote', 'local'."""
        ...

    @property
    def provider(self) -> str | None:
        """Provider name (e.g. 'openai', 'anthropic') or None for method-only adapters."""
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
        Edit/refine a prompt using the LLM.

        Args:
            model_id: Model to use (e.g., "gpt-4", "claude-sonnet-4")
            prompt_before: Original prompt to edit
            context: Optional context (generation metadata, user preferences, etc.)
            account: Optional provider account with credentials
            instance_config: Optional config from ProviderInstanceConfig

        Returns:
            Edited prompt text
        """
        ...


# Legacy provider_id → (method, provider) mapping
_LEGACY_ALIASES: dict[str, tuple[str, str | None]] = {
    "openai-llm": ("api", "openai"),
    "anthropic-llm": ("api", "anthropic"),
    "local-llm": ("local", None),
    "cmd-llm": ("cmd", None),
    "remote-cmd-llm": ("remote", None),
}

# Reverse: (method, provider) → legacy provider_id
_REVERSE_ALIASES: dict[tuple[str, str | None], str] = {
    v: k for k, v in _LEGACY_ALIASES.items()
}


def make_registry_key(method: str, provider: str | None = None) -> str:
    """Build the compound registry key."""
    return f"{method}:{provider}" if provider else method


def parse_registry_key(key: str) -> tuple[str, str | None]:
    """Parse a compound registry key back to (method, provider)."""
    if ":" in key:
        method, provider = key.split(":", 1)
        return method, provider
    return key, None


class LlmMethodRegistry(SimpleRegistry[str, LlmProvider]):
    """
    LLM adapter registry keyed by (method, provider).

    Supports legacy provider_id lookup for backward compatibility.
    """

    def __init__(self):
        super().__init__(name="llm_methods", allow_overwrite=True)

    def _get_item_key(self, adapter: LlmProvider) -> str:
        return make_registry_key(adapter.method, adapter.provider)

    def register(self, adapter: LlmProvider) -> None:
        """Register an LLM adapter."""
        key = make_registry_key(adapter.method, adapter.provider)
        super().register(key, adapter)

    def get(self, key_or_legacy_id: str) -> LlmProvider:
        """
        Get adapter by compound key or legacy provider_id.

        Accepts:
          - "api:openai" (new style)
          - "openai-llm" (legacy)
          - "remote" (method-only)

        Raises:
            ProviderNotFoundError: Adapter not registered
        """
        # Try direct key first
        if self.has(key_or_legacy_id):
            return super().get(key_or_legacy_id)

        # Try legacy alias
        alias = _LEGACY_ALIASES.get(key_or_legacy_id)
        if alias:
            key = make_registry_key(*alias)
            if self.has(key):
                return super().get(key)

        raise ProviderNotFoundError(key_or_legacy_id)

    def get_by_method_provider(self, method: str, provider: str | None = None) -> LlmProvider:
        """Get adapter by method and optional provider."""
        key = make_registry_key(method, provider)
        if self.has(key):
            return super().get(key)
        raise ProviderNotFoundError(f"{method}:{provider}" if provider else method)

    def list_providers(self) -> dict[str, LlmProvider]:
        """Get all registered adapters."""
        return dict(self.items())

    def list_provider_ids(self) -> list[str]:
        """Get all registered keys (includes legacy aliases for backward compat)."""
        keys = list(self.keys())
        # Also expose legacy IDs for existing consumers
        for key in list(keys):
            method, provider = parse_registry_key(key)
            legacy = _REVERSE_ALIASES.get((method, provider))
            if legacy and legacy not in keys:
                keys.append(legacy)
        return keys


# Global registry instance
llm_registry = LlmMethodRegistry()
