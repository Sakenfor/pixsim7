from __future__ import annotations

from pixsim7.backend.main.lib.registry.simple import SimpleRegistry

from .compiler_v1 import CompilerV1
from .interfaces import BlockCompiler


class CompilerRegistry(SimpleRegistry[str, BlockCompiler]):
    """Registry of block compilers, keyed by ``compiler_id``."""

    def __init__(self) -> None:
        super().__init__(name="CompilerRegistry", allow_overwrite=True, log_operations=False)

    def _get_item_key(self, item: BlockCompiler) -> str:
        compiler_id = str(getattr(item, "compiler_id", "") or "").strip()
        if not compiler_id:
            raise ValueError("compiler must define non-empty compiler_id")
        return compiler_id


def build_default_compiler_registry() -> CompilerRegistry:
    registry = CompilerRegistry()
    registry.register_item(CompilerV1())
    return registry
