"""
Unified concepts domain.

Provides a single interface for accessing all concept kinds
(role, part, body_region, pose, influence_region).
"""
from .providers import (
    ConceptProvider,
    RoleConceptProvider,
    PartConceptProvider,
    BodyRegionConceptProvider,
    PoseConceptProvider,
    InfluenceRegionConceptProvider,
)
from .registry import (
    register_concept_provider,
    get_concept_provider,
    get_all_kinds,
    get_all_providers,
    reset_providers,
)

__all__ = [
    # Provider base class
    "ConceptProvider",
    # Provider implementations
    "RoleConceptProvider",
    "PartConceptProvider",
    "BodyRegionConceptProvider",
    "PoseConceptProvider",
    "InfluenceRegionConceptProvider",
    # Registry functions
    "register_concept_provider",
    "get_concept_provider",
    "get_all_kinds",
    "get_all_providers",
    "reset_providers",
]
