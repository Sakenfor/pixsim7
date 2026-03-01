"""Composition-derived analysis helpers.

This module intentionally keeps only helpers used by template and runtime
composition paths to derive analyzer-compatible metadata from selected blocks.
"""
from typing import Any, Dict, List, Set

from pixsim7.backend.main.services.prompt.tag_inference import (
    derive_sub_tags_from_ontology_ids,
)


def _read_block_value(block: Any, key: str, default: Any = None) -> Any:
    if isinstance(block, dict):
        return block.get(key, default)
    return getattr(block, key, default)


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
        analysis_candidates.append(analysis_candidate)

    return {
        "prompt": assembled_prompt,
        "candidates": analysis_candidates,
        "tags": _derive_tags_from_composition_blocks(blocks),
        "source": "composition",
    }


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


def _derive_tags_from_composition_blocks(blocks: List[Any]) -> List[str]:
    """Derive flat role and keyword tags from composition blocks."""
    role_tags: Set[str] = set()
    keyword_tags: Set[str] = set()

    for block in blocks:
        metadata_raw = _read_block_value(block, "block_metadata", {})
        block_metadata = dict(metadata_raw or {}) if isinstance(metadata_raw, dict) else {}
        role = block_metadata.get("role") or _infer_role_from_block(block)
        if role and role != "other":
            role_tags.add(f"has:{role}")

        block_tags = _read_block_value(block, "tags", None) or {}
        ontology_ids: List[str] = []
        if isinstance(block_tags, dict):
            for key, value in block_tags.items():
                if value is True:
                    keyword_tags.add(key)
                elif isinstance(value, str):
                    keyword_tags.add(f"{key}:{value}")
                elif key == "ontology_ids" and isinstance(value, list):
                    ontology_ids = [oid for oid in value if isinstance(oid, str) and oid]
                    for oid in ontology_ids:
                        keyword_tags.add(oid)
        if ontology_ids:
            keyword_tags.update(derive_sub_tags_from_ontology_ids(ontology_ids))

    return sorted(role_tags) + sorted(keyword_tags)
