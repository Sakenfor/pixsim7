from __future__ import annotations

from typing import Any, Dict, Optional, Protocol, runtime_checkable

from ..resolution_core.types import ResolutionRequest


@runtime_checkable
class BlockCompiler(Protocol):
    """Protocol for template compilers.

    A compiler reads a template (slots, controls, metadata) and produces
    a neutral ``ResolutionRequest`` IR that any resolver can consume.

    Compilers are versioned and independently evolvable over the same
    shared content (blocks + templates).
    """

    compiler_id: str

    async def compile(
        self,
        *,
        service: Any,  # BlockTemplateService (avoid circular import)
        template: Any,
        candidate_limit: int,
        control_values: Optional[Dict[str, Any]],
        resolver_id: Optional[str] = None,
    ) -> ResolutionRequest: ...
