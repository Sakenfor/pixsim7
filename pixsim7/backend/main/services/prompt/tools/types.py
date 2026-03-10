"""Prompt tool service types."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Mapping, Optional

PromptToolSource = Literal["builtin", "user", "shared"]
PromptToolCategory = Literal["rewrite", "compose", "edit", "extract", "analysis"]
PromptToolCatalogScope = Literal["self", "shared", "builtin", "all"]

PromptToolExecutionHandler = Callable[
    [str, Mapping[str, Any], Mapping[str, Any]],
    Mapping[str, Any],
]


@dataclass(frozen=True)
class PromptToolPresetRecord:
    """Normalized prompt tool preset descriptor used by services and API."""

    id: str
    label: str
    description: str
    source: PromptToolSource
    category: PromptToolCategory
    enabled: bool = True
    requires: tuple[str, ...] = ()
    defaults: dict[str, Any] = field(default_factory=dict)
    owner_user_id: Optional[int] = None
    owner_payload: Optional[dict[str, Any]] = None
    handler: Optional[PromptToolExecutionHandler] = field(
        default=None,
        repr=False,
        compare=False,
    )
