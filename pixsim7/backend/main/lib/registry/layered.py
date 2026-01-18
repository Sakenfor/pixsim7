"""
Layered Registry - key-value registry with ordered layers.

Supports stacking multiple sources (e.g., core, plugin, runtime) where
higher-precedence layers override lower layers when resolving items.
"""

from __future__ import annotations

from typing import Dict, Generic, Iterator, List, Optional, TypeVar
import structlog

from pixsim7.backend.main.lib.registry.base import RegistryBase, RegistryObserverMixin
from pixsim7.backend.main.lib.registry.errors import (
    DuplicateKeyError,
    KeyNotFoundError,
)
from pixsim7.backend.main.lib.registry.simple import (
    SimpleRegistry,
)

logger = structlog.get_logger(__name__)

K = TypeVar("K")
V = TypeVar("V")
NS = TypeVar("NS")


class LayeredRegistry(RegistryObserverMixin, RegistryBase, Generic[K, V]):
    """
    Registry with ordered layers.

    Layer order is low -> high precedence. When resolving items without a layer,
    the highest-precedence layer containing the key is returned.
    """

    def __init__(
        self,
        name: Optional[str] = None,
        layer_order: Optional[List[str]] = None,
        allow_overwrite: bool = False,
        allow_cross_layer_overwrite: bool = True,
        log_operations: bool = True,
        auto_create_layer: bool = True,
    ):
        super().__init__(name=name, log_operations=log_operations)
        self._allow_overwrite = allow_overwrite
        self._allow_cross_layer_overwrite = allow_cross_layer_overwrite
        self._auto_create_layer = auto_create_layer
        self._layers: Dict[str, SimpleRegistry[K, V]] = {}
        self._layer_order: List[str] = []

        if layer_order:
            for layer in layer_order:
                self.add_layer(layer)

    @property
    def name(self) -> str:
        return self._name

    # =========================================================================
    # Layer Management
    # =========================================================================

    def add_layer(self, layer: str, *, position: Optional[int] = None) -> None:
        if layer in self._layers:
            raise ValueError(f"Layer '{layer}' already exists in {self._name}")

        self._layers[layer] = SimpleRegistry(
            name=f"{self._name}:{layer}",
            allow_overwrite=self._allow_overwrite,
            log_operations=self._log_operations,
        )

        if position is None:
            self._layer_order.append(layer)
        else:
            self._layer_order.insert(position, layer)

        if self._log_operations:
            logger.debug("Added layer", registry=self._name, layer=layer)

    def has_layer(self, layer: str) -> bool:
        return layer in self._layers

    def layers(self) -> List[str]:
        """Return layer order (low -> high precedence)."""
        return list(self._layer_order)

    def set_layer_order(self, layer_order: List[str]) -> None:
        missing = [layer for layer in self._layers if layer not in layer_order]
        if missing:
            raise ValueError(
                f"Layer order missing existing layers: {missing}"
            )
        self._layer_order = list(layer_order)

    # =========================================================================
    # Core Operations
    # =========================================================================

    def register(self, layer: str, key: K, item: V) -> None:
        if layer not in self._layers:
            if self._auto_create_layer:
                self.add_layer(layer)
            else:
                raise ValueError(
                    f"Layer '{layer}' does not exist in {self._name}"
                )

        if not self._allow_cross_layer_overwrite:
            existing_layer = self.resolve_layer(key)
            if existing_layer is not None and existing_layer != layer:
                raise DuplicateKeyError(str(key), self._name)

        self._layers[layer].register(key, item)
        self._notify_listeners("register", layer=layer, key=str(key))

    def get(self, key: K, *, layer: Optional[str] = None) -> V:
        if layer is not None:
            if layer not in self._layers:
                raise KeyNotFoundError(str(layer), f"{self._name}:layers")
            return self._layers[layer].get(key)

        resolved_layer = self.resolve_layer(key)
        if resolved_layer is None:
            raise KeyNotFoundError(str(key), self._name)
        return self._layers[resolved_layer].get(key)

    def get_or_none(self, key: K, *, layer: Optional[str] = None) -> Optional[V]:
        try:
            return self.get(key, layer=layer)
        except KeyNotFoundError:
            return None

    def has(self, key: K, *, layer: Optional[str] = None) -> bool:
        if layer is not None:
            registry = self._layers.get(layer)
            return registry.has(key) if registry else False
        return self.resolve_layer(key) is not None

    def resolve_layer(self, key: K) -> Optional[str]:
        for layer in reversed(self._layer_order):
            if self._layers[layer].has(key):
                return layer
        return None

    def unregister(self, key: K, *, layer: Optional[str] = None) -> Optional[V]:
        if layer is not None:
            registry = self._layers.get(layer)
            removed = registry.unregister(key) if registry else None
            if removed is not None:
                self._notify_listeners("unregister", layer=layer, key=str(key))
            return removed

        resolved_layer = self.resolve_layer(key)
        if resolved_layer is None:
            return None
        removed = self._layers[resolved_layer].unregister(key)
        if removed is not None:
            self._notify_listeners(
                "unregister",
                layer=resolved_layer,
                key=str(key),
            )
        return removed

    def clear(self) -> None:
        total = self.total_count()
        for registry in self._layers.values():
            registry.clear()
        if total > 0:
            self._notify_listeners("clear", count=total)

    def clear_layer(self, layer: str) -> None:
        if layer in self._layers:
            count = len(self._layers[layer])
            self._layers[layer].clear()
            if count > 0:
                self._notify_listeners("clear", layer=layer, count=count)

    # =========================================================================
    # Query Operations
    # =========================================================================

    def keys(self, *, layer: Optional[str] = None) -> List[K]:
        if layer is not None:
            registry = self._layers.get(layer)
            return registry.keys() if registry else []
        return list(self._effective_items().keys())

    def values(self, *, layer: Optional[str] = None) -> List[V]:
        if layer is not None:
            registry = self._layers.get(layer)
            return registry.values() if registry else []
        return list(self._effective_items().values())

    def items(self, *, layer: Optional[str] = None) -> List[tuple[K, V]]:
        if layer is not None:
            registry = self._layers.get(layer)
            return registry.items() if registry else []
        return list(self._effective_items().items())

    def items_with_layers(self) -> List[tuple[str, K, V]]:
        result: List[tuple[str, K, V]] = []
        for layer in self._layer_order:
            for key, value in self._layers[layer].items():
                result.append((layer, key, value))
        return result

    def total_count(self) -> int:
        return sum(len(registry) for registry in self._layers.values())

    def _effective_items(self) -> Dict[K, V]:
        result: Dict[K, V] = {}
        for layer in self._layer_order:
            for key, value in self._layers[layer].items():
                result[key] = value
        return result

    # =========================================================================
    # Dunder Methods
    # =========================================================================

    def __len__(self) -> int:
        return len(self._effective_items())

    def __contains__(self, key: K) -> bool:
        return self.has(key)

    def __iter__(self) -> Iterator[K]:
        return iter(self.keys())


class LayeredNestedRegistry(RegistryBase, Generic[NS, K, V]):
    """
    Namespace -> LayeredRegistry mapping with shared layer order.
    """

    def __init__(
        self,
        name: Optional[str] = None,
        layer_order: Optional[List[str]] = None,
        default_layer: Optional[str] = None,
        allow_overwrite: bool = False,
        allow_cross_layer_overwrite: bool = True,
        log_operations: bool = True,
        auto_create_namespace: bool = True,
        auto_create_layer: bool = True,
    ):
        super().__init__(name=name, log_operations=log_operations)
        self._layer_order: List[str] = []
        self._default_layer = default_layer
        self._allow_overwrite = allow_overwrite
        self._allow_cross_layer_overwrite = allow_cross_layer_overwrite
        self._auto_create_namespace = auto_create_namespace
        self._auto_create_layer = auto_create_layer
        self._namespaces: Dict[NS, LayeredRegistry[K, V]] = {}

        if layer_order:
            for layer in layer_order:
                self.add_layer(layer)

    # =========================================================================
    # Layer Management
    # =========================================================================

    def add_layer(self, layer: str, *, position: Optional[int] = None) -> None:
        if layer in self._layer_order:
            raise ValueError(f"Layer '{layer}' already exists in {self._name}")

        if position is None:
            self._layer_order.append(layer)
        else:
            self._layer_order.insert(position, layer)

        for registry in self._namespaces.values():
            registry.add_layer(layer)
            registry.set_layer_order(self._layer_order)

    def has_layer(self, layer: str) -> bool:
        return layer in self._layer_order

    def layers(self) -> List[str]:
        return list(self._layer_order)

    # =========================================================================
    # Namespace Management
    # =========================================================================

    def add_namespace(self, namespace: NS) -> None:
        if namespace in self._namespaces:
            raise ValueError(f"Namespace '{namespace}' already exists in {self._name}")

        registry = LayeredRegistry[K, V](
            name=f"{self._name}:{namespace}",
            layer_order=self._layer_order,
            allow_overwrite=self._allow_overwrite,
            allow_cross_layer_overwrite=self._allow_cross_layer_overwrite,
            log_operations=self._log_operations,
            auto_create_layer=self._auto_create_layer,
        )
        self._namespaces[namespace] = registry

    def has_namespace(self, namespace: NS) -> bool:
        return namespace in self._namespaces

    def namespaces(self) -> List[NS]:
        return list(self._namespaces.keys())

    # =========================================================================
    # Item Operations
    # =========================================================================

    def register(
        self,
        namespace: NS,
        key: K,
        item: V,
        *,
        layer: Optional[str] = None,
    ) -> None:
        if namespace not in self._namespaces:
            if self._auto_create_namespace:
                self.add_namespace(namespace)
            else:
                raise ValueError(
                    f"Namespace '{namespace}' does not exist in {self._name}"
                )

        target_layer = layer or self._default_layer
        if target_layer is None:
            raise ValueError("Layer is required when no default_layer is set")

        self._namespaces[namespace].register(target_layer, key, item)

    def get(
        self,
        namespace: NS,
        key: K,
        *,
        layer: Optional[str] = None,
    ) -> Optional[V]:
        registry = self._namespaces.get(namespace)
        if registry is None:
            return None
        return registry.get_or_none(key, layer=layer)

    def has(
        self,
        namespace: NS,
        key: K,
        *,
        layer: Optional[str] = None,
    ) -> bool:
        registry = self._namespaces.get(namespace)
        if registry is None:
            return False
        return registry.has(key, layer=layer)

    def unregister(
        self,
        namespace: NS,
        key: K,
        *,
        layer: Optional[str] = None,
    ) -> Optional[V]:
        registry = self._namespaces.get(namespace)
        if registry is None:
            return None
        return registry.unregister(key, layer=layer)

    # =========================================================================
    # Query Operations
    # =========================================================================

    def all_of(self, namespace: NS, *, layer: Optional[str] = None) -> List[V]:
        registry = self._namespaces.get(namespace)
        if registry is None:
            return []
        return registry.values(layer=layer)

    def keys_of(self, namespace: NS, *, layer: Optional[str] = None) -> List[K]:
        registry = self._namespaces.get(namespace)
        if registry is None:
            return []
        return registry.keys(layer=layer)

    def items_of(self, namespace: NS, *, layer: Optional[str] = None) -> List[tuple[K, V]]:
        registry = self._namespaces.get(namespace)
        if registry is None:
            return []
        return registry.items(layer=layer)

    def count_of(self, namespace: NS, *, layer: Optional[str] = None) -> int:
        registry = self._namespaces.get(namespace)
        if registry is None:
            return 0
        if layer is None:
            return len(registry)
        return len(registry.items(layer=layer))

    def total_count(self) -> int:
        return sum(len(registry) for registry in self._namespaces.values())

    # =========================================================================
    # Bulk Operations
    # =========================================================================

    def clear(self) -> None:
        self._namespaces.clear()

    def reset(self) -> None:
        self.clear()

    def clear_layer(self, layer: str) -> None:
        for registry in self._namespaces.values():
            if registry.has_layer(layer):
                registry.clear_layer(layer)

    # =========================================================================
    # Dunder Methods
    # =========================================================================

    def __len__(self) -> int:
        return self.total_count()

    def __contains__(self, namespace: NS) -> bool:
        return namespace in self._namespaces

    def __iter__(self) -> Iterator[NS]:
        return iter(self._namespaces)
