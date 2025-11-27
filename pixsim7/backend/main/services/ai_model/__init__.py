"""
AI Model Registry service for managing AI models and parsers.
"""
from .registry import AiModelRegistry, ai_model_registry
from .defaults import (
    get_default_model,
    get_all_defaults,
    set_default_model,
    set_all_defaults,
)

__all__ = [
    "AiModelRegistry",
    "ai_model_registry",
    "get_default_model",
    "get_all_defaults",
    "set_default_model",
    "set_all_defaults",
]
