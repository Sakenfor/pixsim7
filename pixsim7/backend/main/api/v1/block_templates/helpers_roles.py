"""Composition role inference and block response helpers."""
from typing import List, Optional, Dict, Any

from pixsim7.backend.main.services.prompt.block.composition_role_inference import (
    infer_composition_role,
)
from pixsim7.backend.main.services.prompt.block.capabilities import (
    normalize_capability_ids,
)
from .schemas import BlockResponse


def _compute_slot_composition_summary(slots: Any) -> tuple[int, List[str]]:
    """Return (gap_count, unique_role_ids) from composition role inference."""
    if not isinstance(slots, list):
        return 0, []
    gaps = 0
    role_ids: set[str] = set()
    for slot in slots:
        if not isinstance(slot, dict):
            continue
        result = infer_composition_role(
            role=slot.get("role"),
            category=slot.get("category"),
            tags=slot.get("tags") or slot.get("tag_constraints"),
        )
        if result.confidence in ("unknown", "ambiguous"):
            gaps += 1
        if result.role_id:
            role_ids.add(result.role_id)
    return gaps, sorted(role_ids)


def _enrich_slots_with_composition_hints(slots: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add composition_role_hint to each slot dict (non-mutating)."""
    enriched = []
    for slot in slots:
        result = infer_composition_role(
            role=slot.get("role"),
            category=slot.get("category"),
            tags=slot.get("tags") or slot.get("tag_constraints"),
        )
        enriched.append({
            **slot,
            "composition_role_hint": result.role_id,
        })
    return enriched


def _parse_tag_csv(tags: Optional[str]) -> Dict[str, str]:
    tag_constraints: Dict[str, str] = {}
    if not tags:
        return tag_constraints
    for pair in tags.split(","):
        pair = pair.strip()
        if ":" not in pair:
            continue
        tag_key, tag_value = pair.split(":", 1)
        tag_constraints[tag_key.strip()] = tag_value.strip()
    return tag_constraints


def _infer_block_composition_role(block: Any) -> Optional[str]:
    """Infer composition role id for a block row."""
    tags = getattr(block, "tags", None)
    tags_dict: Dict[str, Any] = tags if isinstance(tags, dict) else {}
    raw_tag_role = tags_dict.get("composition_role") if isinstance(tags_dict, dict) else None
    if isinstance(raw_tag_role, str) and raw_tag_role.strip():
        normalized = raw_tag_role.strip()
        if normalized.startswith("role:"):
            normalized = normalized.split(":", 1)[1].strip()
        if normalized:
            return normalized
    inferred = infer_composition_role(
        role=None,
        category=getattr(block, "category", None),
        tags=tags_dict,
    )
    role_id = inferred.role_id
    if isinstance(role_id, str) and role_id.strip():
        return role_id.strip()
    return None


def _to_block_response(block: Any) -> BlockResponse:
    tags = block.tags if isinstance(getattr(block, "tags", None), dict) else {}
    block_metadata = (
        block.block_metadata
        if isinstance(getattr(block, "block_metadata", None), dict)
        else {}
    )
    raw_role = getattr(block, "role", None)
    inferred = infer_composition_role(
        role=raw_role,
        category=getattr(block, "category", None),
        tags=tags,
    )
    role = raw_role if isinstance(raw_role, str) and raw_role.strip() else inferred.role_id
    package_name = getattr(block, "package_name", None)
    if not package_name and isinstance(tags, dict):
        source_pack = tags.get("source_pack")
        if isinstance(source_pack, str) and source_pack.strip():
            package_name = source_pack.strip()

    text = str(getattr(block, "text", "") or "")
    word_count = getattr(block, "word_count", None)
    if not isinstance(word_count, int):
        word_count = len([token for token in text.split() if token])

    default_intent = getattr(block, "default_intent", None)
    default_intent_text = None
    if default_intent is not None:
        default_intent_text = (
            default_intent.value
            if hasattr(default_intent, "value")
            else str(default_intent)
        )

    return BlockResponse(
        id=block.id,
        block_id=block.block_id,
        composition_role=role,
        category=getattr(block, "category", None),
        kind=str(getattr(block, "kind", "single_state") or "single_state"),
        default_intent=default_intent_text,
        text=text,
        tags=tags,
        block_metadata=block_metadata,
        capabilities=normalize_capability_ids(getattr(block, "capabilities", None)),
        complexity_level=getattr(block, "complexity_level", None),
        package_name=package_name,
        description=getattr(block, "description", None),
        word_count=word_count,
    )


def _iter_scalar_tag_values(value: Any) -> List[str]:
    """Flatten tag values for lightweight dictionary statistics."""
    if value is None:
        return []
    if isinstance(value, list):
        out: List[str] = []
        for item in value:
            if item is None or isinstance(item, (dict, list)):
                continue
            out.append(str(item))
        return out
    if isinstance(value, dict):
        return []
    return [str(value)]
