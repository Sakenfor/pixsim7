"""
Template CRUD Registry - Generic CRUD infrastructure for template entities.

Provides a registry-based approach for standardized CRUD operations across
template entity types (LocationTemplate, ItemTemplate, etc.).

Usage:
    # Register a template type
    registry = get_template_crud_registry()
    registry.register_spec(TemplateCRUDSpec(
        kind="locationTemplate",
        model=LocationTemplate,
        url_prefix="location-templates",
        ...
    ))

    # Use in service
    service = TemplateCRUDService(db, registry.get("locationTemplate"))
    items = await service.list()
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import (
    Any,
    Callable,
    Coroutine,
    Dict,
    Generic,
    List,
    Optional,
    Type,
    TypeVar,
    Union,
)
from uuid import UUID

from pydantic import BaseModel
from sqlmodel import SQLModel

from pixsim7.backend.main.lib.registry import SimpleRegistry


T = TypeVar("T", bound=SQLModel)

# Type aliases for hooks
CreateHook = Callable[[Any, Dict[str, Any]], Coroutine[Any, Any, Dict[str, Any]]]
UpdateHook = Callable[[Any, Any, Dict[str, Any]], Coroutine[Any, Any, Dict[str, Any]]]
DeleteHook = Callable[[Any, Any], Coroutine[Any, Any, bool]]
IdParser = Callable[[Any], Any]


def parse_uuid(value: Any) -> UUID:
    """Parse UUIDs from strings or UUID instances."""
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


def parse_int(value: Any) -> int:
    """Parse integer IDs."""
    return int(value)


@dataclass
class TemplateCRUDSpec:
    """
    Configuration for a template entity's CRUD operations.

    Attributes:
        kind: Unique identifier for this template type (e.g., "locationTemplate")
        model: The SQLModel class for the template entity
        url_prefix: URL path segment for routes (e.g., "location-templates")
        id_field: Primary key field name (default: "id")
        id_parser: Function to parse/validate IDs (default: parse_uuid)
        unique_field: Optional field for upsert behavior (e.g., "location_id")

        # Schema configuration
        create_schema: Pydantic model for create requests (optional, uses model if None)
        update_schema: Pydantic model for update requests (optional)
        response_schema: Pydantic model for responses (optional, uses model if None)
        list_response_schema: Pydantic model for list responses (optional)

        # Behavior flags
        supports_soft_delete: If True, set is_active=False instead of hard delete
        supports_upsert: If True, POST will update if unique_field exists
        enable_list: Generate list endpoint
        enable_get: Generate get endpoint
        enable_create: Generate create endpoint
        enable_update: Generate update endpoint
        enable_delete: Generate delete endpoint

        # Query configuration
        default_limit: Default pagination limit
        max_limit: Maximum pagination limit
        list_order_by: Default ordering field
        list_order_desc: Default ordering direction
        filterable_fields: Fields that can be filtered in list queries

        # Hooks for custom behavior
        before_create: Async hook called before creating (db, data) -> data
        after_create: Async hook called after creating (db, entity) -> None
        before_update: Async hook called before updating (db, entity, data) -> data
        after_update: Async hook called after updating (db, entity) -> None
        before_delete: Async hook called before deleting (db, entity) -> bool (allow)
        after_delete: Async hook called after deleting (db, entity_id) -> None

        # Metadata
        tags: API tags for OpenAPI docs
        description: Description for OpenAPI docs
    """

    kind: str
    model: Type[SQLModel]
    url_prefix: str

    # ID configuration
    id_field: str = "id"
    id_parser: IdParser = field(default=parse_uuid)
    unique_field: Optional[str] = None

    # Schema configuration
    create_schema: Optional[Type[BaseModel]] = None
    update_schema: Optional[Type[BaseModel]] = None
    response_schema: Optional[Type[BaseModel]] = None
    list_response_schema: Optional[Type[BaseModel]] = None

    # Behavior flags
    supports_soft_delete: bool = True
    supports_upsert: bool = True
    enable_list: bool = True
    enable_get: bool = True
    enable_create: bool = True
    enable_update: bool = True
    enable_delete: bool = True

    # Query configuration
    default_limit: int = 50
    max_limit: int = 200
    list_order_by: str = "created_at"
    list_order_desc: bool = True
    filterable_fields: List[str] = field(default_factory=list)

    # Hooks
    before_create: Optional[CreateHook] = None
    after_create: Optional[Callable] = None
    before_update: Optional[UpdateHook] = None
    after_update: Optional[Callable] = None
    before_delete: Optional[DeleteHook] = None
    after_delete: Optional[Callable] = None

    # Metadata
    tags: List[str] = field(default_factory=lambda: ["templates"])
    description: Optional[str] = None

    def __post_init__(self):
        # Set default filterable fields if not provided
        if not self.filterable_fields:
            self.filterable_fields = ["is_active"]
            if self.unique_field:
                self.filterable_fields.append(self.unique_field)


class TemplateCRUDRegistry(SimpleRegistry[str, TemplateCRUDSpec]):
    """
    Registry for template CRUD specifications.

    Tracks all registered template types and their CRUD configurations.
    Used by the router factory to generate API endpoints.

    Example:
        registry = TemplateCRUDRegistry()
        registry.register_spec(TemplateCRUDSpec(
            kind="locationTemplate",
            model=LocationTemplate,
            url_prefix="location-templates",
        ))

        # Get spec for route generation
        spec = registry.get("locationTemplate")
    """

    def __init__(self):
        super().__init__(
            name="template_crud",
            allow_overwrite=True,
            seed_on_init=False,
            log_operations=True,
        )

    def _get_item_key(self, item: TemplateCRUDSpec) -> str:
        return item.kind

    def register_spec(self, spec: TemplateCRUDSpec) -> str:
        """Register a template CRUD specification."""
        return self.register_item(spec)

    def get_by_url_prefix(self, url_prefix: str) -> Optional[TemplateCRUDSpec]:
        """Find spec by URL prefix."""
        for spec in self.values():
            if spec.url_prefix == url_prefix:
                return spec
        return None

    def list_specs(self) -> List[TemplateCRUDSpec]:
        """Get all registered specs."""
        return self.values()

    def get_enabled_specs(self) -> List[TemplateCRUDSpec]:
        """Get specs that have at least one CRUD operation enabled."""
        return [
            spec for spec in self.values()
            if any([
                spec.enable_list,
                spec.enable_get,
                spec.enable_create,
                spec.enable_update,
                spec.enable_delete,
            ])
        ]


# Global singleton instance
_template_crud_registry: Optional[TemplateCRUDRegistry] = None


def get_template_crud_registry() -> TemplateCRUDRegistry:
    """Get the global template CRUD registry instance."""
    global _template_crud_registry
    if _template_crud_registry is None:
        _template_crud_registry = TemplateCRUDRegistry()
    return _template_crud_registry


def reset_template_crud_registry() -> None:
    """Reset the global registry (mainly for testing)."""
    global _template_crud_registry
    if _template_crud_registry is not None:
        _template_crud_registry.clear()
    _template_crud_registry = None
