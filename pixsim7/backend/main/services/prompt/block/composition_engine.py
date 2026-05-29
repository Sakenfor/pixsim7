"""Composition-derived analysis helpers.

This module intentionally keeps only helpers used by template and runtime
composition paths to derive analyzer-compatible metadata from selected blocks.
"""
from typing import Any, Dict, List, Set

# Structural / bookkeeping block-tag keys that describe provenance or scope
# rather than asset content. Lifting them as asset tags just adds noise that's
# identical across most generated assets, so they never become candidate
# ontology IDs nor flat keyword tags.
_NON_SEMANTIC_TAG_KEYS: Set[str] = {
    "source_pack",
    "scope",
    "world",
    "duration_sec",
    "version",
    "category",
    "legacy_category",
    "composition_role",
    "ontology_ids",
    "ontology_ids_exclude",
}


def _read_block_value(block: Any, key: str, default: Any = None) -> Any:
    if isinstance(block, dict):
        return block.get(key, default)
    return getattr(block, key, default)


def _semantic_tag_ontology_ids(block_tags: Any) -> List[str]:
    """Synthesize ``key:value`` ontology IDs from a block's string-valued tags.

    Authored annotations like ``tone:slapstick`` / ``arc:comedy`` / ``mood:playful``
    live as plain ``{key: value}`` entries on a block (they are not in the
    canonical prompt-block-tag schema), so they must be lifted explicitly for
    the modern candidate path to preserve them. Bookkeeping keys are dropped;
    downstream validation (``_ONTOLOGY_ID_RE``) discards any malformed result.
    """
    if not isinstance(block_tags, dict):
        return []
    result: List[str] = []
    for key, value in block_tags.items():
        if not isinstance(key, str) or key in _NON_SEMANTIC_TAG_KEYS:
            continue
        if not isinstance(value, str) or not value:
            continue
        result.append(f"{key}:{value}")
    return result


def derive_analysis_from_blocks(
    blocks: List[Any],
    assembled_prompt: str,
) -> Dict[str, Any]:
    """Derive analyzer-shaped output from composition blocks."""
    analysis_candidates: List[Dict[str, Any]] = []
    for block in blocks:
        metadata_raw = _read_block_value(block, "block_metadata", {})
        block_metadata = dict(metadata_raw or {}) if isinstance(metadata_raw, dict) else {}
        block_text = str(_read_block_value(block, "text", "") or "")

        analysis_candidate = {
            "role": block_metadata.get("role") or _infer_role_from_block(block),
            "text": block_text,
            "source_type": "composition",
        }
        category = block_metadata.get("category") or _read_block_value(block, "category", None)
        if category:
            analysis_candidate["category"] = category

        # Lift block ontology_ids into candidate metadata so the modern
        # tag-derivation path (derive_flat_tags) sees them. This merges the
        # block's explicit ontology_ids with semantic ``key:value`` tags
        # (tone:/arc:/mood:/…) so authored annotations are preserved on the
        # candidate — the only analysis tag source now.
        ontology_ids = _collect_candidate_ontology_ids(block)
        if ontology_ids:
            analysis_candidate["metadata"] = {"ontology_ids": ontology_ids}

        analysis_candidates.append(analysis_candidate)

    return {
        "prompt": assembled_prompt,
        "candidates": analysis_candidates,
        "source": "composition",
    }


def _collect_candidate_ontology_ids(block: Any) -> List[str]:
    """Merge a block's explicit ontology_ids with its semantic ``key:value`` tags.

    Deduped and order-preserving; explicit ontology_ids win on ordering.
    """
    block_tags = _read_block_value(block, "tags", None) or {}
    seen: Set[str] = set()
    merged: List[str] = []
    for oid in (*_extract_block_ontology_ids(block), *_semantic_tag_ontology_ids(block_tags)):
        if not oid or oid in seen:
            continue
        seen.add(oid)
        merged.append(oid)
    return merged


def _extract_block_ontology_ids(block: Any) -> List[str]:
    """Pull ontology_ids out of a block's tags dict, deduped and order-preserving."""
    block_tags = _read_block_value(block, "tags", None) or {}
    if not isinstance(block_tags, dict):
        return []
    raw = block_tags.get("ontology_ids")
    if not isinstance(raw, list):
        return []
    seen: Set[str] = set()
    result: List[str] = []
    for oid in raw:
        if not isinstance(oid, str) or not oid:
            continue
        if oid in seen:
            continue
        seen.add(oid)
        result.append(oid)
    return result


def _infer_role_from_block(block: Any) -> str:
    """Infer role from explicit role, tags, metadata, or kind."""
    tags = _read_block_value(block, "tags", None) or {}
    if not isinstance(tags, dict):
        tags = {}
    metadata_raw = _read_block_value(block, "block_metadata", {})
    block_metadata = dict(metadata_raw or {}) if isinstance(metadata_raw, dict) else {}
    block_type = str(block_metadata.get("block_type", "") or "")
    explicit_role = _read_block_value(block, "role", None)
    if isinstance(explicit_role, str) and explicit_role.strip():
        return explicit_role.strip()

    if "character" in tags or "character" in str(tags.values()):
        return "character"
    if "camera" in tags or "camera" in block_type:
        return "camera"
    if "action" in tags or "action" in block_type or "choreography" in block_type:
        return "action"
    if "setting" in tags or "location" in tags:
        return "setting"
    if "mood" in tags or "style" in block_type:
        return "mood"
    if _read_block_value(block, "kind", None) == "transition":
        return "action"
    return "other"
