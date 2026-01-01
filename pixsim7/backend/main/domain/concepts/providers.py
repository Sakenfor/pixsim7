"""
Concept providers for the unified concepts API.

Each provider is responsible for loading concepts of a specific kind
from their respective data sources (composition-roles.yaml, ontology.yaml, etc.).

Providers self-register using the @concept_provider decorator, eliminating
the need to manually update registry.py or __init__.py when adding new kinds.
"""
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional, Type, TypeVar
import yaml

from pixsim7.backend.main.routes.concepts.schemas import ConceptResponse

# Default paths
_ONTOLOGY_PATH = Path(__file__).parent.parent / "ontology" / "data" / "ontology.yaml"

# Provider registry (populated by @concept_provider decorator)
_provider_registry: Dict[str, "ConceptProvider"] = {}

# Track registered provider classes for re-initialization after reset
_provider_classes: List[Type["ConceptProvider"]] = []

T = TypeVar("T", bound="ConceptProvider")


class ConceptProviderError(Exception):
    """Error during concept provider registration or operation."""

    pass


def concept_provider(cls: Type[T]) -> Type[T]:
    """Decorator that auto-registers a ConceptProvider subclass.

    Usage:
        @concept_provider
        class MyConceptProvider(ConceptProvider):
            kind = "my_kind"
            group_name = "My Concepts"
            ...

    The provider instance is created and registered immediately.
    No manual imports or registration calls needed.

    Raises:
        ConceptProviderError: If kind is empty or already registered.
    """
    # Instantiate to get kind/group_name values
    instance = cls()

    # Validate kind is set
    if not instance.kind:
        raise ConceptProviderError(
            f"Provider {cls.__name__} has empty 'kind'. "
            "Set kind = 'your_kind' as a class attribute."
        )

    # Validate group_name is set
    if not instance.group_name:
        raise ConceptProviderError(
            f"Provider {cls.__name__} has empty 'group_name'. "
            "Set group_name = 'Display Name' as a class attribute."
        )

    # Check for duplicate registration
    if instance.kind in _provider_registry:
        existing = _provider_registry[instance.kind]
        raise ConceptProviderError(
            f"Duplicate concept kind '{instance.kind}': "
            f"{cls.__name__} conflicts with {type(existing).__name__}"
        )

    # Register instance and track class for re-initialization
    _provider_registry[instance.kind] = instance
    _provider_classes.append(cls)

    return cls


def get_registered_providers() -> Dict[str, "ConceptProvider"]:
    """Get all registered providers (keyed by kind).

    Returns a copy to prevent external mutation of the registry.
    """
    return dict(_provider_registry)


def get_provider(kind: str) -> Optional["ConceptProvider"]:
    """Get a provider by kind."""
    return _provider_registry.get(kind)


def get_all_kinds() -> List[str]:
    """Get all registered concept kinds."""
    return list(_provider_registry.keys())


def get_label_kinds() -> List[str]:
    """Get concept kinds that should be included in label autocomplete."""
    return [
        kind
        for kind, provider in _provider_registry.items()
        if provider.include_in_labels
    ]


def reset_providers() -> None:
    """Reset and re-initialize the provider registry.

    Clears the registry and re-instantiates all registered provider classes.
    Useful for testing.
    """
    _provider_registry.clear()
    for cls in _provider_classes:
        instance = cls()
        _provider_registry[instance.kind] = instance


class ConceptProvider(ABC):
    """Abstract base class for concept providers.

    Subclasses must define:
        - kind: str - The concept kind (e.g., 'role', 'part')
        - group_name: str - Display name for UI grouping
        - get_concepts() - Returns list of concepts

    Optional overrides:
        - supports_packages: bool - Whether package filtering is supported (default: False)
        - include_in_labels: bool - Whether to include in label autocomplete (default: True)
        - get_priority() - Priority ordering of concept IDs
    """

    # Subclasses must override these
    kind: str = ""
    group_name: str = ""

    # Whether this provider supports package filtering
    supports_packages: bool = False

    # Whether to include this kind in label autocomplete suggestions
    # Set to False for concept kinds that aren't meant for labeling
    include_in_labels: bool = True

    @abstractmethod
    def get_concepts(
        self, package_ids: Optional[List[str]] = None
    ) -> List[ConceptResponse]:
        """Return all concepts of this kind.

        Args:
            package_ids: Optional filter by package IDs.
                        Only applies if supports_packages is True.

        Returns:
            List of concepts.
        """
        ...

    def get_priority(self) -> List[str]:
        """Return priority ordering of concept IDs (if applicable).

        Default returns empty list (no priority).
        Override in subclasses that have priority ordering.
        """
        return []


# =============================================================================
# Provider Implementations
# =============================================================================


@concept_provider
class RoleConceptProvider(ConceptProvider):
    """Provider for composition roles.

    Delegates to existing composition role system which handles
    packages and priority.
    """

    kind = "role"
    group_name = "Composition Roles"
    supports_packages = True

    def get_concepts(
        self, package_ids: Optional[List[str]] = None
    ) -> List[ConceptResponse]:
        from pixsim7.backend.main.domain.composition import get_available_roles

        roles = get_available_roles(package_ids)
        return [
            ConceptResponse(
                kind="role",
                id=role.id,
                label=role.label,
                description=role.description,
                color=role.color,
                group=self.group_name,
                tags=list(role.tags),
                metadata={
                    "default_layer": role.default_layer,
                    "slug_mappings": list(role.slug_mappings),
                    "namespace_mappings": list(role.namespace_mappings),
                },
            )
            for role in roles
        ]

    def get_priority(self) -> List[str]:
        from pixsim7.backend.main.shared.composition import COMPOSITION_ROLE_PRIORITY

        return list(COMPOSITION_ROLE_PRIORITY)


@concept_provider
class PartConceptProvider(ConceptProvider):
    """Provider for body parts from ontology.yaml.

    Combines anatomy_parts and anatomy_regions into a unified 'part' kind,
    plus common general-purpose labels not in ontology.
    """

    kind = "part"
    group_name = "Body Parts"

    # Common parts not in domain-specific ontology but useful for general labeling
    COMMON_PARTS = [
        {"id": "face", "label": "Face"},
        {"id": "hair", "label": "Hair"},
        {"id": "expression", "label": "Expression"},
        {"id": "outfit", "label": "Outfit"},
        {"id": "clothes", "label": "Clothes"},
        {"id": "body", "label": "Body"},
        {"id": "upper_body", "label": "Upper Body"},
        {"id": "lower_body", "label": "Lower Body"},
    ]

    def get_concepts(
        self, package_ids: Optional[List[str]] = None
    ) -> List[ConceptResponse]:
        concepts: List[ConceptResponse] = []
        seen_ids: set[str] = set()

        # Load anatomy_parts from ontology
        for part in self._load_anatomy_parts():
            part_id = self._strip_prefix(part.get("id", ""), "part:")
            if part_id and part_id not in seen_ids:
                seen_ids.add(part_id)
                concepts.append(
                    ConceptResponse(
                        kind="part",
                        id=part_id,
                        label=part.get("label", ""),
                        description="",
                        color="purple",
                        group=self.group_name,
                        tags=part.get("keywords", []),
                        metadata={"properties": part.get("properties", [])},
                    )
                )

        # Load anatomy_regions from ontology (merged into part)
        for region in self._load_anatomy_regions():
            region_id = self._strip_prefix(region.get("id", ""), "region:")
            if region_id and region_id not in seen_ids:
                seen_ids.add(region_id)
                concepts.append(
                    ConceptResponse(
                        kind="part",
                        id=region_id,
                        label=region.get("label", ""),
                        description="",
                        color="green",
                        group=self.group_name,
                        tags=region.get("keywords", []),
                        metadata={},
                    )
                )

        # Add common parts (deduplicated)
        for common in self.COMMON_PARTS:
            if common["id"] not in seen_ids:
                seen_ids.add(common["id"])
                concepts.append(
                    ConceptResponse(
                        kind="part",
                        id=common["id"],
                        label=common["label"],
                        description="",
                        color="gray",
                        group=self.group_name,
                        tags=[],
                        metadata={},
                    )
                )

        return concepts

    def _load_anatomy_parts(self) -> List[Dict[str, Any]]:
        """Load anatomy_parts from ontology.yaml."""
        if not _ONTOLOGY_PATH.exists():
            return []

        try:
            with open(_ONTOLOGY_PATH, "r") as f:
                data = yaml.safe_load(f) or {}

            domain = data.get("domain", {})
            packs = domain.get("packs", {})
            default_pack = packs.get("default", {})
            return default_pack.get("anatomy_parts", [])
        except Exception:
            return []

    def _load_anatomy_regions(self) -> List[Dict[str, Any]]:
        """Load anatomy_regions from ontology.yaml."""
        if not _ONTOLOGY_PATH.exists():
            return []

        try:
            with open(_ONTOLOGY_PATH, "r") as f:
                data = yaml.safe_load(f) or {}

            domain = data.get("domain", {})
            packs = domain.get("packs", {})
            default_pack = packs.get("default", {})
            return default_pack.get("anatomy_regions", [])
        except Exception:
            return []

    def _strip_prefix(self, value: str, prefix: str) -> str:
        """Remove prefix from string if present."""
        return value[len(prefix) :] if value.startswith(prefix) else value


@concept_provider
class PoseConceptProvider(ConceptProvider):
    """Provider for poses from ontology.yaml via OntologyRegistry."""

    kind = "pose"
    group_name = "Poses"

    def get_concepts(
        self, package_ids: Optional[List[str]] = None
    ) -> List[ConceptResponse]:
        from pixsim7.backend.main.domain.ontology import get_ontology_registry

        registry = get_ontology_registry()
        pose_ids = registry.all_pose_ids()

        concepts = []
        for pose_id in pose_ids:
            pose = registry.get_pose(pose_id)
            if pose:
                concepts.append(
                    ConceptResponse(
                        kind="pose",
                        id=pose.short_id,
                        label=pose.label or pose.short_id.replace("_", " ").title(),
                        description="",
                        color="cyan",
                        group=self.group_name,
                        tags=pose.tags,
                        metadata={
                            "category": pose.category,
                            "parent": pose.parent,
                            "intimacy_min": pose.intimacy_min,
                            "detector_labels": pose.detector_labels,
                        },
                    )
                )

        return concepts


@concept_provider
class InfluenceRegionConceptProvider(ConceptProvider):
    """Provider for built-in influence regions (foreground, background, etc.)."""

    kind = "influence_region"
    group_name = "Influence Regions"

    # Hardcoded influence region builtins
    INFLUENCE_REGIONS = [
        {
            "id": "foreground",
            "label": "Foreground",
            "description": "Apply to foreground elements",
            "color": "blue",
        },
        {
            "id": "background",
            "label": "Background",
            "description": "Apply to background elements",
            "color": "green",
        },
        {
            "id": "full",
            "label": "Full Image",
            "description": "Apply to entire image",
            "color": "gray",
        },
        {
            "id": "subject",
            "label": "Subject",
            "description": "Apply to detected subject",
            "color": "orange",
        },
    ]

    def get_concepts(
        self, package_ids: Optional[List[str]] = None
    ) -> List[ConceptResponse]:
        return [
            ConceptResponse(
                kind="influence_region",
                id=region["id"],
                label=region["label"],
                description=region.get("description", ""),
                color=region.get("color", "gray"),
                group=self.group_name,
                tags=[],
                metadata={},
            )
            for region in self.INFLUENCE_REGIONS
        ]


# Export
__all__ = [
    # Decorator and errors
    "concept_provider",
    "ConceptProviderError",
    # Registry access
    "get_registered_providers",
    "get_provider",
    "get_all_kinds",
    "get_label_kinds",
    "reset_providers",
    # Base class
    "ConceptProvider",
    # Provider implementations (for type hints, not for manual registration)
    "RoleConceptProvider",
    "PartConceptProvider",
    "PoseConceptProvider",
    "InfluenceRegionConceptProvider",
]
