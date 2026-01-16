"""
Pack registry helpers for layered registries.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Generic, Iterable, List, Optional, Sequence, Tuple, TypeVar

from pixsim7.backend.main.lib.registry.errors import DuplicateKeyError, KeyNotFoundError
from pixsim7.backend.main.lib.registry.base import RegistryBase, RegistryObserverMixin

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


@dataclass(frozen=True)
class SimplePackItemRef(Generic[NS, K]):
    """Reference to a registered pack item without layer metadata."""
    namespace: NS
    key: K


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


class SimplePackRegistryBase(RegistryObserverMixin, RegistryBase, Generic[NS, K, V, M]):
    """
    Pack registry helpers for registries without layer support.

    Tracks pack metadata and registered items so packs can be unloaded cleanly.
    Item registration is delegated to _register_item/_unregister_item so
    subclasses can decide how (or if) to store items.
    """

    def __init__(
        self,
        *,
        name: Optional[str] = None,
        allow_overwrite: bool = True,
        seed_on_init: bool = False,
        log_operations: bool = True,
    ):
        super().__init__(name=name, log_operations=log_operations)
        self._allow_overwrite = allow_overwrite
        self._pack_index: Dict[str, List[SimplePackItemRef[NS, K]]] = {}
        self._pack_meta: Dict[str, M] = {}

        if seed_on_init:
            self._seed_defaults()

    # =========================================================================
    # Pack Lifecycle
    # =========================================================================

    def register_pack(
        self,
        pack_id: str,
        items: Optional[Sequence[Tuple[NS, K, V]]] = None,
        *,
        meta: Optional[M] = None,
        allow_overwrite: Optional[bool] = None,
    ) -> None:
        if allow_overwrite is None:
            allow_overwrite = self._allow_overwrite

        if pack_id in self._pack_index and not allow_overwrite:
            raise DuplicateKeyError(pack_id, self._name)

        if pack_id in self._pack_index and allow_overwrite:
            self.unregister_pack(pack_id)

        item_refs: List[SimplePackItemRef[NS, K]] = []
        for namespace, key, item in items or []:
            self._register_item(namespace, key, item)
            item_refs.append(SimplePackItemRef(namespace=namespace, key=key))

        self._pack_index[pack_id] = item_refs
        if meta is not None:
            self._pack_meta[pack_id] = meta

        self._log_debug("Registered pack", pack_id=pack_id)
        self._notify_listeners("register_pack", pack_id=pack_id)

    def unregister_pack(self, pack_id: str) -> Optional[M]:
        item_refs = self._pack_index.pop(pack_id, [])
        for ref in item_refs:
            self._unregister_item(ref.namespace, ref.key)

        meta = self._pack_meta.pop(pack_id, None)

        if meta is not None:
            self._log_debug("Unregistered pack", pack_id=pack_id)
            self._notify_listeners("unregister_pack", pack_id=pack_id)

        return meta

    def list_packs(self) -> List[M]:
        return list(self._pack_meta.values())

    def has_pack(self, pack_id: str) -> bool:
        return pack_id in self._pack_index

    def pack_items(self, pack_id: str) -> Iterable[SimplePackItemRef[NS, K]]:
        return list(self._pack_index.get(pack_id, []))

    # =========================================================================
    # Registry-like helpers (metadata)
    # =========================================================================

    def get(self, pack_id: str) -> M:
        if pack_id not in self._pack_meta:
            raise KeyNotFoundError(str(pack_id), self._name)
        return self._pack_meta[pack_id]

    def get_or_none(self, pack_id: str) -> Optional[M]:
        return self._pack_meta.get(pack_id)

    def has(self, pack_id: str) -> bool:
        return pack_id in self._pack_meta

    def keys(self) -> List[str]:
        return list(self._pack_meta.keys())

    def values(self) -> List[M]:
        return list(self._pack_meta.values())

    def items(self) -> List[tuple[str, M]]:
        return list(self._pack_meta.items())

    def clear(self) -> None:
        count = len(self._pack_meta)
        self._pack_index.clear()
        self._pack_meta.clear()

        if count > 0:
            self._log_debug("Cleared packs", count=count)
            self._notify_listeners("clear", count=count)

    def reset(self) -> None:
        self._on_reset()
        self.clear()
        self._seed_defaults()

        self._log_debug("Reset registry", count=len(self._pack_meta))
        self._notify_listeners("reset", count=len(self._pack_meta))

    def __len__(self) -> int:
        return len(self._pack_meta)

    def __contains__(self, pack_id: str) -> bool:
        return pack_id in self._pack_meta

    # =========================================================================
    # Item hooks (override in subclasses as needed)
    # =========================================================================

    def _register_item(self, namespace: NS, key: K, item: V) -> None:
        return None

    def _unregister_item(self, namespace: NS, key: K) -> None:
        return None
