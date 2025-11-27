"""
AI Model Registry for managing AI models and parsing engines.
"""
from typing import Dict, List, Optional
from pixsim7.backend.main.shared.schemas.ai_model_schemas import (
    AiModel,
    AiModelCapability,
)


class AiModelRegistry:
    """
    Registry for AI models and parsing engines.

    This registry stores metadata about available models but does not
    handle invocation - that's done by provider registries or internal engines.
    """

    def __init__(self):
        self._models: Dict[str, AiModel] = {}

    def register(self, model: AiModel) -> None:
        """Register a new AI model in the registry."""
        self._models[model.id] = model

    def get(self, model_id: str) -> Optional[AiModel]:
        """Get a model by ID, returns None if not found."""
        return self._models.get(model_id)

    def get_or_raise(self, model_id: str) -> AiModel:
        """Get a model by ID, raises KeyError if not found."""
        if model_id not in self._models:
            raise KeyError(f"Model '{model_id}' not found in registry")
        return self._models[model_id]

    def list_all(self) -> List[AiModel]:
        """List all registered models."""
        return list(self._models.values())

    def list_by_capability(self, capability: AiModelCapability) -> List[AiModel]:
        """List all models that support a given capability."""
        return [m for m in self._models.values() if capability in m.capabilities]

    def clear(self) -> None:
        """Clear all registered models (mainly for testing)."""
        self._models.clear()


# Global registry instance
ai_model_registry = AiModelRegistry()
