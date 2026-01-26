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
from enum import Enum
from typing import (
    Any,
    Callable,
    Coroutine,
    Dict,
    Generic,
    List,
    Optional,
    Tuple,
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
TransformHook = Callable[[Any], Any]  # Sync transform for response
AsyncTransformHook = Callable[[Any, Any], Coroutine[Any, Any, Any]]  # Async transform (db, entity) -> response
ValidateHook = Callable[[Dict[str, Any]], Coroutine[Any, Any, Tuple[bool, Optional[str]]]]  # (data) -> (valid, error_msg)
IdParser = Callable[[Any], Any]
FilterBuilder = Callable[[Any, Dict[str, Any]], Any]  # (query, filters) -> query with conditions


def parse_uuid(value: Any) -> UUID:
    """Parse UUIDs from strings or UUID instances."""
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


def parse_int(value: Any) -> int:
    """Parse integer IDs."""
    return int(value)


def parse_str(value: Any) -> str:
    """Parse string IDs."""
    return str(value)


class FilterOperator(str, Enum):
    """Supported filter operators for advanced queries."""
    EQ = "eq"           # Equal
    NE = "ne"           # Not equal
    GT = "gt"           # Greater than
    GTE = "gte"         # Greater than or equal
    LT = "lt"           # Less than
    LTE = "lte"         # Less than or equal
    IN = "in"           # In list
    NOT_IN = "not_in"   # Not in list
    LIKE = "like"       # LIKE pattern
    ILIKE = "ilike"     # Case-insensitive LIKE
    IS_NULL = "is_null" # Is NULL
    NOT_NULL = "not_null"  # Is not NULL
    CONTAINS = "contains"  # JSON contains (for JSONB fields)


@dataclass
class FilterField:
    """Configuration for a filterable field with advanced options."""
    name: str
    operators: List[FilterOperator] = field(default_factory=lambda: [FilterOperator.EQ])
    field_type: str = "string"  # string, int, bool, uuid, date, json
    description: Optional[str] = None


@dataclass
class CustomAction:
    """Configuration for a custom action endpoint beyond standard CRUD."""
    name: str                    # Action identifier (e.g., "publish", "archive")
    method: str                  # HTTP method (POST, PUT, PATCH)
    path_suffix: str             # URL suffix (e.g., "/publish", "/{id}/archive")
    handler: Callable            # Async handler function
    request_schema: Optional[Type[BaseModel]] = None
    response_schema: Optional[Type[BaseModel]] = None
    description: Optional[str] = None
    requires_id: bool = True     # Whether action requires entity ID


@dataclass
class NestedEntitySpec:
    """Configuration for nested/child entities under a parent."""
    kind: str                    # Nested entity kind
    parent_field: str            # Field on nested entity that references parent
    url_suffix: str              # URL suffix under parent (e.g., "hotspots")
    model: Type[SQLModel]        # Nested entity model
    id_field: str = "id"
    id_parser: IdParser = field(default=parse_int)
    enable_list: bool = True
    enable_get: bool = True
    enable_create: bool = True
    enable_update: bool = True
    enable_delete: bool = True
    cascade_delete: bool = False  # Delete nested when parent is deleted


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
        advanced_filters: Advanced filter configurations with operators
        custom_filter_builder: Custom function to build complex filter conditions
        search_fields: Fields to search in when using search parameter

        # Ownership/Scoping
        owner_field: Field that stores owner user ID (enables user-scoped queries)
        scope_to_owner: If True, automatically filter by current user

        # Hierarchy support
        parent_field: Field that references parent entity
        parent_kind: Kind of parent entity (for validation)

        # Response transformation
        transform_response: Sync function to transform entity to response
        async_transform_response: Async function for complex transformations (db access)
        transform_list_item: Transform each item in list response

        # Validation hooks
        validate_create: Async validation before create (data) -> (valid, error_msg)
        validate_update: Async validation before update (data) -> (valid, error_msg)

        # Hooks for custom behavior
        before_create: Async hook called before creating (db, data) -> data
        after_create: Async hook called after creating (db, entity) -> None
        before_update: Async hook called before updating (db, entity, data) -> data
        after_update: Async hook called after updating (db, entity) -> None
        before_delete: Async hook called before deleting (db, entity) -> bool (allow)
        after_delete: Async hook called after deleting (db, entity_id) -> None

        # Custom actions and nested entities
        custom_actions: List of custom action endpoints
        nested_entities: List of nested entity specifications

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
    advanced_filters: List[FilterField] = field(default_factory=list)
    custom_filter_builder: Optional[FilterBuilder] = None
    search_fields: List[str] = field(default_factory=lambda: ["name"])

    # Ownership/Scoping
    owner_field: Optional[str] = None
    scope_to_owner: bool = False

    # Hierarchy support
    parent_field: Optional[str] = None
    parent_kind: Optional[str] = None

    # Response transformation
    transform_response: Optional[TransformHook] = None
    async_transform_response: Optional[AsyncTransformHook] = None
    transform_list_item: Optional[TransformHook] = None

    # Validation hooks
    validate_create: Optional[ValidateHook] = None
    validate_update: Optional[ValidateHook] = None

    # CRUD Hooks
    before_create: Optional[CreateHook] = None
    after_create: Optional[Callable] = None
    before_update: Optional[UpdateHook] = None
    after_update: Optional[Callable] = None
    before_delete: Optional[DeleteHook] = None
    after_delete: Optional[Callable] = None

    # Custom actions and nested entities
    custom_actions: List[CustomAction] = field(default_factory=list)
    nested_entities: List[NestedEntitySpec] = field(default_factory=list)

    # Metadata
    tags: List[str] = field(default_factory=lambda: ["templates"])
    description: Optional[str] = None

    def __post_init__(self):
        # Set default filterable fields if not provided
        if not self.filterable_fields:
            self.filterable_fields = ["is_active"]
            if self.unique_field:
                self.filterable_fields.append(self.unique_field)

    def get_filter_field(self, name: str) -> Optional[FilterField]:
        """Get advanced filter configuration for a field."""
        for ff in self.advanced_filters:
            if ff.name == name:
                return ff
        return None

    def has_custom_action(self, name: str) -> bool:
        """Check if a custom action is registered."""
        return any(a.name == name for a in self.custom_actions)

    def get_custom_action(self, name: str) -> Optional[CustomAction]:
        """Get custom action by name."""
        for action in self.custom_actions:
            if action.name == name:
                return action
        return None


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
