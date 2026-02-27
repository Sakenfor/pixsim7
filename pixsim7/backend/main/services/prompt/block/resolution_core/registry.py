from __future__ import annotations

from typing import Dict

from .interfaces import BlockResolver
from .next_v1_resolver import NextV1Resolver
from .types import ResolutionRequest, ResolutionResult


class ResolverRegistry:
    def __init__(self) -> None:
        self._resolvers: Dict[str, BlockResolver] = {}

    def register(self, resolver: BlockResolver) -> None:
        resolver_id = str(getattr(resolver, "resolver_id", "") or "").strip()
        if not resolver_id:
            raise ValueError("resolver must define non-empty resolver_id")
        self._resolvers[resolver_id] = resolver

    def get(self, resolver_id: str) -> BlockResolver:
        key = str(resolver_id or "").strip()
        try:
            return self._resolvers[key]
        except KeyError as exc:
            known = ", ".join(sorted(self._resolvers.keys()))
            raise KeyError(
                f"unknown resolver: {key!r}" + (f" (known: {known})" if known else "")
            ) from exc

    def resolve(self, request: ResolutionRequest) -> ResolutionResult:
        return self.get(request.resolver_id).resolve(request)

    def ids(self) -> list[str]:
        return sorted(self._resolvers.keys())


def build_default_resolver_registry() -> ResolverRegistry:
    registry = ResolverRegistry()
    registry.register(NextV1Resolver())
    return registry
