"""
AI Model Registry for managing AI models and parsing engines.
"""
from typing import List, Optional

from pixsim7.backend.main.lib.registry import SimpleRegistry
from pixsim7.backend.main.shared.schemas.ai_model_schemas import (
    AiModel,
    AiModelCapability,
)


class AiModelRegistry(SimpleRegistry[str, AiModel]):
    """
    Registry for AI models and parsing engines.

    This registry stores metadata about available models but does not
    handle invocation - that's done by provider registries or internal engines.
    """

    def __init__(self):
        super().__init__(name="ai_models", allow_overwrite=True)

    def _get_item_key(self, model: AiModel) -> str:
        return model.id

    def register(self, model: AiModel) -> None:
        """Register a new AI model in the registry."""
        super().register(model.id, model)

    def get(self, model_id: str) -> Optional[AiModel]:
        """Get a model by ID, returns None if not found."""
        return self.get_or_none(model_id)

    def get_or_raise(self, model_id: str) -> AiModel:
        """Get a model by ID, raises KeyError if not found."""
        model = self.get_or_none(model_id)
        if model is None:
            raise KeyError(f"Model '{model_id}' not found in registry")
        return model

    def list_all(self) -> List[AiModel]:
        """List all registered models."""
        return self.values()

    def list_by_capability(self, capability: AiModelCapability) -> List[AiModel]:
        """List all models that support a given capability."""
        return [m for m in self.values() if capability in m.capabilities]


# Global registry instance
ai_model_registry = AiModelRegistry()
