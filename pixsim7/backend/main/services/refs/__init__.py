"""Entity Reference Services.

Provides infrastructure for working with EntityRef references:
- Registry for mapping field names to entity types
- Resolver for loading entities from EntityRef instances
"""
from pixsim7.backend.main.services.refs.entity_ref_registry import (
    EntityRefRegistry,
    FieldRefConfig,
    get_entity_ref_registry,
    register_default_ref_mappings,
)
from pixsim7.backend.main.services.refs.entity_resolver import EntityRefResolver

__all__ = [
    "EntityRefRegistry",
    "FieldRefConfig",
    "get_entity_ref_registry",
    "register_default_ref_mappings",
    "EntityRefResolver",
]
