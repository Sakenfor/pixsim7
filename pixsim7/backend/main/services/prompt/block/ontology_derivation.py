"""Auto-derivation of block tags.ontology_ids from block text.

Used by both content-pack loader paths (prompt blocks + primitives) so the
matching contract stays consistent.

Author overrides (read from block_tags):
    ontology_ids:         explicit IDs that survive regardless of matching
    ontology_ids_exclude: IDs to suppress (consumed; not retained)

Auto-derived IDs come from `vocabularies.match_keywords(text)`, with
`role:*` matches dropped — role membership is already captured via the
composition `has:{role}` candidate path, so re-emitting it as an
ontology_id reproduces the category-leak pattern the bare-bool drop
fixed. Explicit author overrides starting with `role:` still pass
through. The merged result is deduped and order-preserving (explicit
first, auto second). If nothing survives, the key is dropped to keep
tags tidy.
"""

from __future__ import annotations

from typing import Any, Dict, List


def populate_block_ontology_ids(
    *,
    block_tags: Dict[str, Any],
    text: str,
) -> Dict[str, Any]:
    """Mutate-and-return: write tags.ontology_ids derived from text + overrides."""
    raw_explicit = block_tags.get("ontology_ids")
    explicit_ids: List[str] = (
        [oid for oid in raw_explicit if isinstance(oid, str) and oid]
        if isinstance(raw_explicit, list)
        else []
    )
    raw_exclude = block_tags.pop("ontology_ids_exclude", None)
    exclude_ids: set[str] = (
        {oid for oid in raw_exclude if isinstance(oid, str) and oid}
        if isinstance(raw_exclude, list)
        else set()
    )

    auto_ids: List[str] = []
    if text and text.strip():
        try:
            from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

            auto_ids = [
                oid for oid in get_registry().match_keywords(text)
                if not oid.startswith("role:")
            ]
        except Exception:
            auto_ids = []

    seen: set[str] = set()
    merged: List[str] = []
    for oid in (*explicit_ids, *auto_ids):
        if oid in seen or oid in exclude_ids:
            continue
        seen.add(oid)
        merged.append(oid)

    if merged:
        block_tags["ontology_ids"] = merged
    elif "ontology_ids" in block_tags:
        del block_tags["ontology_ids"]
    return block_tags


__all__ = ["populate_block_ontology_ids"]
