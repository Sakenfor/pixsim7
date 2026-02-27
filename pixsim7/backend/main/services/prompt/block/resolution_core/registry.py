from __future__ import annotations

from pixsim7.backend.main.lib.registry.simple import SimpleRegistry

from .interfaces import BlockResolver
from .next_v1_resolver import NextV1Resolver
from .types import ResolutionRequest, ResolutionResult


class ResolverRegistry(SimpleRegistry[str, BlockResolver]):
    """Registry of block resolvers, keyed by ``resolver_id``."""

    def __init__(self) -> None:
        super().__init__(name="ResolverRegistry", allow_overwrite=True, log_operations=False)

    def _get_item_key(self, item: BlockResolver) -> str:
        resolver_id = str(getattr(item, "resolver_id", "") or "").strip()
        if not resolver_id:
            raise ValueError("resolver must define non-empty resolver_id")
        return resolver_id

    # Domain-specific sugar --------------------------------------------------

    def resolve(self, request: ResolutionRequest) -> ResolutionResult:
        return self.get(request.resolver_id).resolve(request)

    def ids(self) -> list[str]:
        return sorted(self.keys())


def build_default_resolver_registry() -> ResolverRegistry:
    registry = ResolverRegistry()
    registry.register_item(NextV1Resolver())
    return registry
