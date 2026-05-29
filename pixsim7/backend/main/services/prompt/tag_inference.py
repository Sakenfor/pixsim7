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

    Mood ontology IDs are emitted verbatim by callers (e.g. ``mood:tender``);
    we intentionally do NOT collapse them into a coarse ``tone:soft`` /
    ``tone:intense`` bucket. That heuristic stamped ``tone:soft`` on the entire
    low-tension positive/romantic half of the mood space — and on any prompt
    that literally contained the word "soft" (a ``mood:tender`` keyword) — so
    it landed on roughly every other asset and drowned out the accurate
    per-mood tag. Authored ``tone:`` / ``arc:`` annotations now flow through
    the composition path instead of being re-derived here.
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

        if tag_id.startswith("camera:"):
            camera = registry.get_camera(tag_id)
            if camera is not None:
                derived.update(_derive_camera_tags(camera))
            continue

    return derived
