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
    """

    def __init__(self, raw: Dict[str, Any]) -> None:
        self.raw = raw
        self.version: str = raw.get("version", "0.0.0")
        self.label: str = raw.get("label", "")
        self.description: str = raw.get("description", "")

        self.entities: Dict[str, OntologyEntityKind] = {}
        entities_raw = raw.get("entities", {})
        for name, data in entities_raw.items():
            self.entities[name] = OntologyEntityKind(name=name, data=data)

        self.relationships: List[OntologyRelationship] = []
        for rel in raw.get("relationships", []):
            self.relationships.append(
                OntologyRelationship(
                    id=rel.get("id", ""),
                    from_type=rel.get("from", ""),
                    to_type=rel.get("to", ""),
                    predicate=rel.get("predicate", ""),
                )
            )

        self.intensity = raw.get("intensity", {})
        self.speed = raw.get("speed", {})

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

