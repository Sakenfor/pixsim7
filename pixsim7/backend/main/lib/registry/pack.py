"""
Pack registry helpers for layered registries.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Generic, Iterable, List, Optional, Sequence, Tuple, TypeVar

from pixsim7.backend.main.lib.registry.errors import DuplicateKeyError

NS = TypeVar("NS")
K = TypeVar("K")
V = TypeVar("V")
M = TypeVar("M")


@dataclass(frozen=True)
class PackItemRef(Generic[NS, K]):
    """Reference to a registered pack item."""
    namespace: NS
    key: K
    layer: str


class PackRegistryBase(Generic[NS, K, V, M]):
    """
    Base class for pack registration and unloading.

    Stores pack item indices to support clean unload. Pack metadata is optional
    and left to the concrete registry.
    """

    def __init__(
        self,
        *,
        registry,
        name: str,
    ):
        self._registry = registry
        self._name = name
        self._pack_index: Dict[str, List[PackItemRef[NS, K]]] = {}
        self._pack_meta: Dict[str, M] = {}

    def register_pack(
        self,
        pack_id: str,
        items: Sequence[Tuple[NS, K, V]],
        *,
        layer: str,
        meta: Optional[M] = None,
        allow_overwrite: bool = False,
    ) -> None:
        if pack_id in self._pack_index and not allow_overwrite:
            raise DuplicateKeyError(pack_id, self._name)

        if pack_id in self._pack_index and allow_overwrite:
            self.unregister_pack(pack_id)

        item_refs: List[PackItemRef[NS, K]] = []
        for namespace, key, item in items:
            self._registry.register(namespace, key, item, layer=layer)
            item_refs.append(PackItemRef(namespace=namespace, key=key, layer=layer))

        self._pack_index[pack_id] = item_refs
        if meta is not None:
            self._pack_meta[pack_id] = meta

    def unregister_pack(self, pack_id: str) -> Optional[M]:
        item_refs = self._pack_index.pop(pack_id, [])
        for ref in item_refs:
            self._registry.unregister(ref.namespace, ref.key, layer=ref.layer)

        return self._pack_meta.pop(pack_id, None)

    def list_packs(self) -> List[M]:
        return list(self._pack_meta.values())

    def has_pack(self, pack_id: str) -> bool:
        return pack_id in self._pack_index

    def pack_items(self, pack_id: str) -> Iterable[PackItemRef[NS, K]]:
        return list(self._pack_index.get(pack_id, []))

