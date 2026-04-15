"""
Vocabulary API

Production read endpoints for the VocabularyRegistry. Exposes vocab items
(parts, poses, moods, locations, roles, etc.) for frontend consumption
(autocomplete, pickers, reference sources).

Read-only. Write/edit support is not in scope — vocabularies are YAML-authored.
"""
from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

router = APIRouter(prefix="/vocabulary", tags=["vocabulary"])


def _serialize_item(item: Any) -> Dict[str, Any]:
    """Normalize a vocab item (dataclass or dict) to a plain dict.

    Strips the internal `source` field since it's an implementation detail
    (which YAML pack it came from), not meaningful to API consumers.
    """
    if is_dataclass(item):
        data = asdict(item)
    elif isinstance(item, dict):
        data = dict(item)
    else:
        data = {"id": getattr(item, "id", None), "label": getattr(item, "label", None)}
    data.pop("source", None)
    return data


@router.get("/types")
async def list_vocab_types() -> Dict[str, List[str]]:
    """List available vocabulary type keys (e.g. 'parts', 'poses', 'moods')."""
    registry = get_registry()
    return {"types": registry.list_vocab_types()}


@router.get("/{vocab_type}")
async def list_vocab_items(vocab_type: str) -> Dict[str, Any]:
    """Return all items of a vocabulary type.

    Args:
        vocab_type: e.g. 'parts', 'poses', 'moods', 'locations', 'roles'.

    Returns:
        { "type": str, "count": int, "items": [ {id, label, ...}, ... ] }
    """
    registry = get_registry()
    try:
        raw_items = registry.all_of(vocab_type)
    except Exception as exc:  # pragma: no cover — defensive
        raise HTTPException(
            status_code=400,
            detail=f"Unknown vocabulary type '{vocab_type}': {exc}",
        ) from exc

    if raw_items is None:
        raise HTTPException(status_code=404, detail=f"Vocabulary type '{vocab_type}' not found")

    items = [_serialize_item(i) for i in raw_items]
    return {"type": vocab_type, "count": len(items), "items": items}
