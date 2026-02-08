"""
Concept providers for the unified concepts API.

Each provider is responsible for loading concepts of a specific kind
from their respective data sources (VocabularyRegistry, composition system, etc.).

Providers self-register using the @concept_provider decorator, eliminating
the need to manually update registry.py or __init__.py when adding new kinds.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Set, Type, TypeVar

from pixsim7.backend.main.routes.concepts.schemas import ConceptResponse


# =============================================================================
# Vocab Provider Config - Reduces repetition for VocabularyRegistry-backed providers
# =============================================================================

@dataclass
class VocabProviderConfig:
    """Configuration for a vocabulary-backed concept provider."""
    kind: str                    # Concept kind (e.g., "pose")
    group_name: str              # Display group name
    color: str                   # UI color
    prefix: str                  # ID prefix to strip (e.g., "pose:")
    getter_name: str             # VocabularyRegistry method (e.g., "all_poses")
    label_attr: str = "label"    # Attribute for label
    tags_attr: Optional[str] = None  # Attribute for tags (or None)
    metadata_fn: Optional[Callable[[Any], Dict[str, Any]]] = None  # Extract metadata


def _make_vocab_provider(config: VocabProviderConfig) -> Type["ConceptProvider"]:
    """Factory to create a ConceptProvider class from config."""

    class _VocabProvider(ConceptProvider):
        kind = config.kind
        group_name = config.group_name

        def get_concepts(
            self, package_ids: Optional[List[str]] = None
        ) -> List[ConceptResponse]:
            from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

            registry = get_registry()
            getter = getattr(registry, config.getter_name)
            items = getter()

            concepts = []
            for item in items:
                # Strip prefix from ID
                short_id = item.id
                if short_id.startswith(config.prefix):
                    short_id = short_id[len(config.prefix):]

                # Get label
                label = getattr(item, config.label_attr, "") or short_id.replace("_", " ").title()

                # Get tags
                tags = []
                if config.tags_attr:
                    tags = getattr(item, config.tags_attr, []) or []

                # Get metadata
                metadata = {}
                if config.metadata_fn:
                    metadata = config.metadata_fn(item)

                concepts.append(
                    ConceptResponse(
                        kind=config.kind,
                        id=short_id,
                        label=label,
                        description="",
                        color=config.color,
                        group=self.group_name,
                        tags=tags,
                        metadata=metadata,
                    )
                )

            return concepts

    # Set class name for debugging
    _VocabProvider.__name__ = f"{config.kind.title()}ConceptProvider"
    _VocabProvider.__qualname__ = _VocabProvider.__name__

    return _VocabProvider

# Provider registry (populated by @concept_provider decorator)
_provider_registry: Dict[str, "ConceptProvider"] = {}

# Track registered provider classes for re-initialization after reset
_provider_classes: List[Type["ConceptProvider"]] = []
_dynamic_provider_kinds: Set[str] = set()

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
    _ensure_dynamic_vocab_providers()
    return dict(_provider_registry)


def get_provider(kind: str) -> Optional["ConceptProvider"]:
    """Get a provider by kind."""
    _ensure_dynamic_vocab_providers()
    return _provider_registry.get(kind)


def get_all_kinds() -> List[str]:
    """Get all registered concept kinds."""
    _ensure_dynamic_vocab_providers()
    return list(_provider_registry.keys())


def get_label_kinds() -> List[str]:
    """Get concept kinds that should be included in label autocomplete."""
    _ensure_dynamic_vocab_providers()
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
    _dynamic_provider_kinds.clear()
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


def _ensure_dynamic_vocab_providers() -> None:
    """Register providers for plugin-defined vocab types (if any)."""
    from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

    registry = get_registry()
    for vocab_type in registry.list_dynamic_types():
        if vocab_type in _provider_registry:
            continue

        meta = registry.get_dynamic_type_meta(vocab_type) or {}
        provider = DynamicVocabConceptProvider(vocab_type, meta)
        _provider_registry[vocab_type] = provider
        _dynamic_provider_kinds.add(vocab_type)


class DynamicVocabConceptProvider(ConceptProvider):
    """Provider for plugin-defined vocab types."""

    def __init__(self, kind: str, meta: Dict[str, Any]) -> None:
        self.kind = kind
        self.group_name = meta.get("group_name") or kind.replace("_", " ").title()
        self.supports_packages = False
        self.include_in_labels = bool(meta.get("include_in_labels", True))
        self._prefix = meta.get("prefix")
        self._color = meta.get("color") or "gray"
        self._label_attr = meta.get("label_attr") if "label_attr" in meta else "label"
        self._description_attr = meta.get("description_attr")
        self._tags_attr = meta.get("tags_attr")

    def get_concepts(
        self, package_ids: Optional[List[str]] = None
    ) -> List[ConceptResponse]:
        from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

        registry = get_registry()
        items = registry.all_of(self.kind)
        concepts: List[ConceptResponse] = []

        for item in items:
            short_id = item.id
            if self._prefix and short_id.startswith(self._prefix):
                short_id = short_id[len(self._prefix):]

            label = ""
            if self._label_attr:
                label = getattr(item, self._label_attr, "") or ""
            if not label:
                label = short_id.replace("_", " ").title()

            description = ""
            if self._description_attr:
                description = getattr(item, self._description_attr, "") or ""

            tags: List[str] = []
            if self._tags_attr:
                raw_tags = getattr(item, self._tags_attr, []) or []
                if isinstance(raw_tags, list):
                    tags = [str(tag) for tag in raw_tags]

            metadata: Dict[str, Any] = {}
            data = getattr(item, "data", None)
            if isinstance(data, dict):
                metadata = dict(data)
                if self._label_attr:
                    metadata.pop(self._label_attr, None)
                if self._description_attr:
                    metadata.pop(self._description_attr, None)
                if self._tags_attr:
                    metadata.pop(self._tags_attr, None)

            concepts.append(
                ConceptResponse(
                    kind=self.kind,
                    id=short_id,
                    label=label,
                    description=description,
                    color=self._color,
                    group=self.group_name,
                    tags=tags,
                    metadata=metadata,
                )
            )

        return concepts


@concept_provider
class RoleConceptProvider(ConceptProvider):
    """Provider for composition roles from CompositionPackageRegistry."""

    kind = "role"
    group_name = "Composition Roles"
    supports_packages = True

    def get_concepts(
        self, package_ids: Optional[List[str]] = None
    ) -> List[ConceptResponse]:
        from pixsim7.backend.main.domain.composition import get_available_roles

        roles = get_available_roles(package_ids)

        concepts = []
        for role in roles:
            concepts.append(
                ConceptResponse(
                    kind="role",
                    id=role.id,
                    label=role.label,
                    description=role.description,
                    color=role.color,
                    group=self.group_name,
                    tags=role.tags,
                    metadata={
                        "default_layer": role.default_layer,
                        "slug_mappings": role.slug_mappings,
                        "namespace_mappings": role.namespace_mappings,
                    },
                )
            )

        return concepts

    def get_priority(self) -> List[str]:
        from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

        priority = get_registry().role_priority
        return [role_id[5:] if role_id.startswith("role:") else role_id for role_id in priority]


@concept_provider
class PartConceptProvider(ConceptProvider):
    """Provider for body parts from VocabularyRegistry."""

    kind = "part"
    group_name = "Body Parts"

    def get_concepts(
        self, package_ids: Optional[List[str]] = None
    ) -> List[ConceptResponse]:
        from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

        registry = get_registry()
        parts = registry.all_parts()

        concepts = []
        for part in parts:
            # Strip "part:" prefix for the concept ID
            short_id = part.id
            if short_id.startswith("part:"):
                short_id = short_id[5:]

            # Color based on category
            color = "purple"
            if part.category == "general":
                color = "gray"
            elif part.category == "appearance":
                color = "pink"
            elif part.category == "specific":
                color = "purple"

            concepts.append(
                ConceptResponse(
                    kind="part",
                    id=short_id,
                    label=part.label or short_id.replace("_", " ").title(),
                    description="",
                    color=color,
                    group=self.group_name,
                    tags=part.keywords,
                    metadata={"category": part.category},
                )
            )

        return concepts


# =============================================================================
# Vocab-backed Providers (config-driven)
# =============================================================================

# Metadata extractors for each type
def _pose_metadata(p) -> Dict[str, Any]:
    return {
        "category": p.category,
        "parent": p.parent,
        "tension": p.tension,
        "detector_labels": p.detector_labels,
        "slots_provides": p.slots.provides,
        "slots_requires": p.slots.requires,
    }


def _location_metadata(loc) -> Dict[str, Any]:
    return {
        "category": loc.category,
        "indoor": loc.indoor,
        "private": loc.private,
        "romantic": loc.romantic,
    }


def _mood_metadata(m) -> Dict[str, Any]:
    return {
        "category": m.category,
        "tension_range": m.tension_range,
        "parent": m.parent,
    }


def _rating_metadata(r) -> Dict[str, Any]:
    return {
        "level": r.level,
        "min_intimacy": r.min_intimacy,
        "requires_age_verification": r.requires_age_verification,
    }


def _camera_metadata(c) -> Dict[str, Any]:
    return {
        "category": c.category,
    }


# Provider configs
VOCAB_PROVIDER_CONFIGS: List[VocabProviderConfig] = [
    VocabProviderConfig(
        kind="pose",
        group_name="Poses",
        color="cyan",
        prefix="pose:",
        getter_name="all_poses",
        tags_attr="tags",
        metadata_fn=_pose_metadata,
    ),
    VocabProviderConfig(
        kind="location",
        group_name="Locations",
        color="green",
        prefix="location:",
        getter_name="all_locations",
        tags_attr="keywords",
        metadata_fn=_location_metadata,
    ),
    VocabProviderConfig(
        kind="mood",
        group_name="Moods",
        color="orange",
        prefix="mood:",
        getter_name="all_moods",
        tags_attr="keywords",
        metadata_fn=_mood_metadata,
    ),
    VocabProviderConfig(
        kind="rating",
        group_name="Content Ratings",
        color="red",
        prefix="rating:",
        getter_name="all_ratings",
        tags_attr="keywords",
        metadata_fn=_rating_metadata,
    ),
    VocabProviderConfig(
        kind="camera",
        group_name="Camera",
        color="blue",
        prefix="camera:",
        getter_name="all_camera",
        tags_attr="keywords",
        metadata_fn=_camera_metadata,
    ),
]

# Create and register vocab-backed providers
PoseConceptProvider = concept_provider(_make_vocab_provider(VOCAB_PROVIDER_CONFIGS[0]))
LocationConceptProvider = concept_provider(_make_vocab_provider(VOCAB_PROVIDER_CONFIGS[1]))
MoodConceptProvider = concept_provider(_make_vocab_provider(VOCAB_PROVIDER_CONFIGS[2]))
RatingConceptProvider = concept_provider(_make_vocab_provider(VOCAB_PROVIDER_CONFIGS[3]))
CameraConceptProvider = concept_provider(_make_vocab_provider(VOCAB_PROVIDER_CONFIGS[4]))


@concept_provider
class InfluenceRegionConceptProvider(ConceptProvider):
    """Provider for influence regions from VocabularyRegistry."""

    kind = "influence_region"
    group_name = "Influence Regions"

    def get_concepts(
        self, package_ids: Optional[List[str]] = None
    ) -> List[ConceptResponse]:
        from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

        registry = get_registry()
        regions = registry.all_influence_regions()

        concepts = []
        for region in regions:
            # Strip "region:" prefix for the concept ID
            short_id = region.id
            if short_id.startswith("region:"):
                short_id = short_id[7:]

            concepts.append(
                ConceptResponse(
                    kind="influence_region",
                    id=short_id,
                    label=region.label,
                    description=region.description,
                    color=region.color,
                    group=self.group_name,
                    tags=[],
                    metadata={},
                )
            )

        return concepts


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
    # Config-driven vocab providers
    "VocabProviderConfig",
    "VOCAB_PROVIDER_CONFIGS",
    # Provider implementations (for type hints, not for manual registration)
    "RoleConceptProvider",
    "PartConceptProvider",
    "PoseConceptProvider",
    "LocationConceptProvider",
    "MoodConceptProvider",
    "RatingConceptProvider",
    "CameraConceptProvider",
    "InfluenceRegionConceptProvider",
]
