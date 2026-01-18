"""
Structured cleanup results for registry operations.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict


def _count_removed(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, dict):
        if "error" in value:
            return 0
        return sum(_count_removed(v) for v in value.values())
    return 0


@dataclass(frozen=True)
class RegistryCleanupResult:
    registries: Dict[str, Any] = field(default_factory=dict)
    errors: Dict[str, str] = field(default_factory=dict)

    @property
    def total_removed(self) -> int:
        return sum(_count_removed(value) for value in self.registries.values())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "registries": dict(self.registries),
            "errors": dict(self.errors),
            "total_removed": self.total_removed,
        }
