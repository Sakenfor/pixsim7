"""
Template CRUD Services

Generic infrastructure for CRUD operations on template entities
(LocationTemplate, ItemTemplate, etc.).

Components:
- TemplateCRUDSpec: Configuration for a template type's CRUD behavior
- TemplateCRUDRegistry: Registry of all template CRUD configurations
- TemplateCRUDService: Generic service for CRUD operations
- create_template_crud_router: Factory for generating API routes
"""
from .crud_registry import (
    TemplateCRUDSpec,
    TemplateCRUDRegistry,
    get_template_crud_registry,
    reset_template_crud_registry,
    parse_uuid,
    parse_int,
)
from .crud_service import TemplateCRUDService
from .crud_router import create_template_crud_router
from .default_specs import register_default_template_specs

__all__ = [
    "TemplateCRUDSpec",
    "TemplateCRUDRegistry",
    "TemplateCRUDService",
    "get_template_crud_registry",
    "reset_template_crud_registry",
    "create_template_crud_router",
    "register_default_template_specs",
    "parse_uuid",
    "parse_int",
]
