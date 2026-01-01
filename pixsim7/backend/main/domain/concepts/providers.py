"""
Concept providers for the unified concepts API.

Each provider is responsible for loading concepts of a specific kind
from their respective data sources (composition-roles.yaml, ontology.yaml, etc.).
"""
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional
import yaml

from pixsim7.backend.main.routes.concepts.schemas import ConceptResponse, get_group_name

# Default paths
_ONTOLOGY_PATH = Path(__file__).parent.parent / "ontology" / "data" / "ontology.yaml"


class ConceptProvider(ABC):
    """Abstract base class for concept providers."""

    @property
    @abstractmethod
    def kind(self) -> str:
        """The concept kind this provider handles."""
        ...

    @abstractmethod
    def get_concepts(
        self, package_ids: Optional[List[str]] = None
    ) -> List[ConceptResponse]:
        """Return all concepts of this kind.

        Args:
            package_ids: Optional filter by package IDs.
                        Only some providers support filtering.

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

    def get_group_name(self) -> str:
        """Get display name for this kind's group."""
        return get_group_name(self.kind)


class RoleConceptProvider(ConceptProvider):
    """Provider for composition roles.

    Delegates to existing composition role system which handles
    packages and priority.
    """

    @property
    def kind(self) -> str:
        return "role"

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
                group=get_group_name("role"),
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


class PartConceptProvider(ConceptProvider):
    """Provider for anatomy parts from ontology.yaml."""

    @property
    def kind(self) -> str:
        return "part"

    def get_concepts(
        self, package_ids: Optional[List[str]] = None
    ) -> List[ConceptResponse]:
        # Load from ontology.yaml domain.packs section
        parts = self._load_anatomy_parts()
        return [
            ConceptResponse(
                kind="part",
                id=self._strip_prefix(part.get("id", ""), "part:"),
                label=part.get("label", ""),
                description="",
                color="purple",  # Default color for parts
                group=get_group_name("part"),
                tags=part.get("keywords", []),
                metadata={
                    "properties": part.get("properties", []),
                },
            )
            for part in parts
        ]

    def _load_anatomy_parts(self) -> List[Dict[str, Any]]:
        """Load anatomy_parts from ontology.yaml."""
        if not _ONTOLOGY_PATH.exists():
            return []

        try:
            with open(_ONTOLOGY_PATH, "r") as f:
                data = yaml.safe_load(f) or {}

            # Navigate to domain.packs.default.anatomy_parts
            domain = data.get("domain", {})
            packs = domain.get("packs", {})
            default_pack = packs.get("default", {})
            return default_pack.get("anatomy_parts", [])
        except Exception:
            return []

    def _strip_prefix(self, value: str, prefix: str) -> str:
        """Remove prefix from string if present."""
        return value[len(prefix):] if value.startswith(prefix) else value


class BodyRegionConceptProvider(ConceptProvider):
    """Provider for body regions from ontology.yaml."""

    @property
    def kind(self) -> str:
        return "body_region"

    def get_concepts(
        self, package_ids: Optional[List[str]] = None
    ) -> List[ConceptResponse]:
        regions = self._load_anatomy_regions()
        return [
            ConceptResponse(
                kind="body_region",
                id=self._strip_prefix(region.get("id", ""), "region:"),
                label=region.get("label", ""),
                description="",
                color="green",  # Default color for regions
                group=get_group_name("body_region"),
                tags=region.get("keywords", []),
                metadata={},
            )
            for region in regions
        ]

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
        return value[len(prefix):] if value.startswith(prefix) else value


class PoseConceptProvider(ConceptProvider):
    """Provider for poses from ontology.yaml via OntologyRegistry."""

    @property
    def kind(self) -> str:
        return "pose"

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
                        color="cyan",  # Default color for poses
                        group=get_group_name("pose"),
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


class InfluenceRegionConceptProvider(ConceptProvider):
    """Provider for built-in influence regions (foreground, background, etc.)."""

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

    @property
    def kind(self) -> str:
        return "influence_region"

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
                group=get_group_name("influence_region"),
                tags=[],
                metadata={},
            )
            for region in self.INFLUENCE_REGIONS
        ]


# Export all provider classes
__all__ = [
    "ConceptProvider",
    "RoleConceptProvider",
    "PartConceptProvider",
    "BodyRegionConceptProvider",
    "PoseConceptProvider",
    "InfluenceRegionConceptProvider",
]
