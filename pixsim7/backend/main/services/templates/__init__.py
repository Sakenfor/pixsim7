"""
Template CRUD Services

Generic infrastructure for CRUD operations on template entities
(LocationTemplate, ItemTemplate, etc.).

Components:
- TemplateCRUDSpec: Configuration for a template type's CRUD behavior
- TemplateCRUDRegistry: Registry of all template CRUD configurations
- TemplateCRUDService: Generic service for CRUD operations
- NestedEntityService: Service for nested/child entities
- create_template_crud_router: Factory for generating API routes

Advanced features:
- FilterField/FilterOperator: Advanced filtering with operators
- CustomAction: Custom action endpoints beyond CRUD
- NestedEntitySpec: Nested entity configuration
- Owner scoping, hierarchy support, response transformation
"""
from .crud_registry import (
    TemplateCRUDSpec,
    TemplateCRUDRegistry,
    FilterField,
    FilterOperator,
    CustomAction,
    NestedEntitySpec,
    get_template_crud_registry,
    reset_template_crud_registry,
    parse_uuid,
    parse_int,
    parse_str,
)
from .crud_service import (
    TemplateCRUDService,
    NestedEntityService,
    CRUDValidationError,
)
from .crud_router import create_template_crud_router
from .default_specs import register_default_template_specs

__all__ = [
    # Core
    "TemplateCRUDSpec",
    "TemplateCRUDRegistry",
    "TemplateCRUDService",
    "NestedEntityService",
    # Configuration classes
    "FilterField",
    "FilterOperator",
    "CustomAction",
    "NestedEntitySpec",
    # Exceptions
    "CRUDValidationError",
    # Functions
    "get_template_crud_registry",
    "reset_template_crud_registry",
    "create_template_crud_router",
    "register_default_template_specs",
    # ID parsers
    "parse_uuid",
    "parse_int",
    "parse_str",
]
