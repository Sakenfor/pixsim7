"""
Prompt tag inference helpers.

Derives secondary/sub-tags from ontology IDs using vocabulary metadata.
"""

from __future__ import annotations

from typing import Iterable, Set


def _normalize(value: str) -> str:
    text = (value or "").strip().lower()
    text = text.replace("_", " ").replace("-", " ")
    return " ".join(text.split())


def _derive_mood_tone_tag(mood: object) -> str | None:
    category = str(getattr(mood, "category", "") or "").strip().lower()
    tension_range = getattr(mood, "tension_range", (0, 10)) or (0, 10)

    low = 0
    high = 10
    if isinstance(tension_range, (list, tuple)) and len(tension_range) >= 2:
        try:
            low = int(tension_range[0])
            high = int(tension_range[1])
        except Exception:
            low = 0
            high = 10

    if high >= 8 or low >= 6 or category == "action":
        return "tone:intense"
    if category in {"romantic", "positive", "neutral"} and high <= 7:
        return "tone:soft"
    return None


def _derive_camera_tags(camera: object) -> Set[str]:
    tags: Set[str] = set()
    category = str(getattr(camera, "category", "") or "").strip().lower()
    camera_id = _normalize(str(getattr(camera, "id", "") or ""))
    label = _normalize(str(getattr(camera, "label", "") or ""))
    keywords = getattr(camera, "keywords", []) or []
    keyword_set = {_normalize(str(kw)) for kw in keywords if isinstance(kw, str)}

    pov_markers = {"pov", "point of view", "first person"}
    closeup_markers = {"closeup", "close up", "tight framing"}

    if category == "angle":
        if (
            "pov" in camera_id
            or "pov" in label
            or keyword_set & pov_markers
        ):
            tags.add("camera:pov")

    if category == "framing":
        if (
            "close" in camera_id
            or "close" in label
            or keyword_set & closeup_markers
        ):
            tags.add("camera:closeup")

    return tags


def derive_sub_tags_from_ontology_ids(ontology_ids: Iterable[str]) -> Set[str]:
    """
    Derive secondary tags from ontology IDs via vocabulary item metadata.
    """
    try:
        from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

        registry = get_registry()
    except Exception:
        return set()

    derived: Set[str] = set()
    for oid in ontology_ids:
        if not isinstance(oid, str) or not oid:
            continue
        tag_id = oid.strip()
        if not tag_id:
            continue

        if tag_id.startswith("mood:"):
            mood = registry.get_mood(tag_id)
            if mood is not None:
                tone = _derive_mood_tone_tag(mood)
                if tone:
                    derived.add(tone)
            continue

        if tag_id.startswith("camera:"):
            camera = registry.get_camera(tag_id)
            if camera is not None:
                derived.update(_derive_camera_tags(camera))
            continue

    return derived
