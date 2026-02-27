from __future__ import annotations

from typing import Protocol

from .types import ResolutionRequest, ResolutionResult


class BlockResolver(Protocol):
    resolver_id: str

    def resolve(self, request: ResolutionRequest) -> ResolutionResult:
        ...
