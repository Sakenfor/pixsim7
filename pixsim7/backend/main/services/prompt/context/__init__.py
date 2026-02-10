"""Prompt Context Services with lazy exports."""
from __future__ import annotations

from importlib import import_module
from typing import Any

_EXPORT_MAP = {
    "FieldMapping": ("mapping", "FieldMapping"),
    "merge_field_mappings": ("mapping", "merge_field_mappings"),
    "set_nested_value": ("mapping", "set_nested_value"),
    "get_nested_value": ("mapping", "get_nested_value"),
    "EnricherFn": ("resolver", "EnricherFn"),
    "PromptContextRequest": ("resolver", "PromptContextRequest"),
    "PromptContextService": ("resolver", "PromptContextService"),
    "PromptContextSnapshot": ("resolver", "PromptContextSnapshot"),
}


def __getattr__(name: str) -> Any:
    target = _EXPORT_MAP.get(name)
    if not target:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

    module_name, attr_name = target
    module = import_module(f"{__name__}.{module_name}")
    value = getattr(module, attr_name)
    globals()[name] = value
    return value

__all__ = [
    # Mapping
    "FieldMapping",
    "merge_field_mappings",
    "set_nested_value",
    "get_nested_value",
    # Resolver
    "EnricherFn",
    "PromptContextRequest",
    "PromptContextService",
    "PromptContextSnapshot",
]
