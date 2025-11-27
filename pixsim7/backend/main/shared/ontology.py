"""
PixSim7 Ontology Loader & Helper

Thin class-based wrapper around `ontology.yaml` to provide a convenient,
type-safe interface for parser, ActionBlocks, and game systems.

Design goals:
- Keep `ontology.yaml` as the single source of truth for IDs and categories.
- Provide simple helper methods (lookup, compatibility checks) in Python.
- Avoid coupling core logic directly to raw YAML/dicts.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Any

import yaml


ONTOLOGY_PATH = Path(__file__).with_name("ontology.yaml")


@dataclass
class OntologyEntityKind:
    """Represents a top-level entity kind (character, anatomy, action, etc.)."""

    name: str
    data: Dict[str, Any]


@dataclass
class OntologyRelationship:
    """Represents a relationship type from the ontology."""

    id: str
    from_type: str
    to_type: str
    predicate: str


class Ontology:
    """
    In-memory representation of ontology.yaml.

    Provides lookup and simple helper methods for use in parser / game systems.

    Supports both core and domain sections:
    - core: Abstract entity types and relationships (stable across all content)
    - domain: Concrete entities, parts, actions, states (content-specific)
    """

    def __init__(self, raw: Dict[str, Any]) -> None:
        self.raw = raw
        self.version: str = raw.get("version", "0.0.0")
        self.label: str = raw.get("label", "")
        self.description: str = raw.get("description", "")

        # Load core section (if present, otherwise fall back to root level for backward compat)
        core = raw.get("core", {})

        # For backward compatibility: if no "core" section, use root "entities"
        entities_raw = core.get("entities", {}) if core else raw.get("entities", {})

        self.entities: Dict[str, OntologyEntityKind] = {}
        for name, data in entities_raw.items():
            self.entities[name] = OntologyEntityKind(name=name, data=data)

        # Load relationships from core or root
        relationships_raw = core.get("relationships", []) if core else raw.get("relationships", [])
        self.relationships: List[OntologyRelationship] = []
        for rel in relationships_raw:
            self.relationships.append(
                OntologyRelationship(
                    id=rel.get("id", ""),
                    from_type=rel.get("from", ""),
                    to_type=rel.get("to", ""),
                    predicate=rel.get("predicate", ""),
                )
            )

        # Load intensity and speed from core or root
        self.intensity = core.get("intensity", {}) if core else raw.get("intensity", {})
        self.speed = core.get("speed", {}) if core else raw.get("speed", {})

        # Load domain section
        self.domain = raw.get("domain", {})

    # ----- Lookup helpers -----

    def get_entity_kind(self, name: str) -> Optional[OntologyEntityKind]:
        """Get a top-level entity kind by name (e.g., 'character', 'anatomy')."""
        return self.entities.get(name)

    def list_action_types(self) -> List[str]:
        """Return all action type IDs (e.g., 'act:movement')."""
        action = self.entities.get("action")
        if not action:
            return []
        types = action.data.get("types", {})
        return [t.get("id") for t in types.values() if isinstance(t, dict) and t.get("id")]

    def list_anatomy_parts(self) -> List[str]:
        """Return all anatomy part IDs (e.g., 'part:shaft')."""
        anatomy = self.entities.get("anatomy")
        if not anatomy:
            return []
        parts = anatomy.data.get("parts", {})
        return [p.get("id") for p in parts.values() if isinstance(p, dict) and p.get("id")]

    def list_camera_views(self) -> List[str]:
        """Return all camera view IDs (e.g., 'cam:pov')."""
        camera = self.entities.get("camera")
        if not camera:
            return []
        views = camera.data.get("views", {})
        return [v.get("id") for v in views.values() if isinstance(v, dict) and v.get("id")]

    def get_relationships_from(self, from_type: str) -> List[OntologyRelationship]:
        """Get all relationships whose 'from' matches the given type."""
        return [r for r in self.relationships if r.from_type == from_type]

    def get_relationships_to(self, to_type: str) -> List[OntologyRelationship]:
        """Get all relationships whose 'to' matches the given type."""
        return [r for r in self.relationships if r.to_type == to_type]

    def match_keywords(self, text: str) -> List[str]:
        """
        Match keywords in text to ontology IDs from the domain section.

        Very small helper: given lowercased text, return a list of ontology IDs
        that apply based on keyword matching.

        Args:
            text: Lowercased text to match

        Returns:
            List of ontology IDs (e.g., ["part:shaft", "state:erect"])
        """
        matched_ids: List[str] = []
        text_lower = text.lower()

        # Get domain packs
        packs = self.domain.get("packs", {})

        # For now, just search the "default" pack
        default_pack = packs.get("default", {})

        # Helper to check keywords in a domain category
        def check_category(category_name: str) -> None:
            category = default_pack.get(category_name, [])
            if not isinstance(category, list):
                return

            for item in category:
                if not isinstance(item, dict):
                    continue

                item_id = item.get("id")
                keywords = item.get("keywords", [])

                if not item_id or not keywords:
                    continue

                # Check if any keyword appears in text
                for keyword in keywords:
                    if keyword.lower() in text_lower:
                        if item_id not in matched_ids:
                            matched_ids.append(item_id)
                        break

        # Check all domain categories
        check_category("anatomy_parts")
        check_category("anatomy_regions")
        check_category("actions")
        check_category("states_physical")
        check_category("states_emotional")
        check_category("states_positional")
        check_category("spatial_location")
        check_category("spatial_orientation")
        check_category("spatial_contact")
        check_category("camera_views")
        check_category("camera_framing")
        check_category("beats_sequence")
        check_category("beats_micro")

        return matched_ids


_ONTOLOGY_CACHE: Optional[Ontology] = None


def load_ontology(force_reload: bool = False) -> Ontology:
    """
    Load ontology.yaml into an Ontology instance.

    Uses a simple module-level cache to avoid re-reading the file repeatedly.
    """
    global _ONTOLOGY_CACHE

    if _ONTOLOGY_CACHE is not None and not force_reload:
        return _ONTOLOGY_CACHE

    if not ONTOLOGY_PATH.exists():
        raise FileNotFoundError(f"Ontology file not found at {ONTOLOGY_PATH}")

    with ONTOLOGY_PATH.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}

    _ONTOLOGY_CACHE = Ontology(raw)
    return _ONTOLOGY_CACHE

