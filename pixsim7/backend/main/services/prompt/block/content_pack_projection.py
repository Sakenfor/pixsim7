"""Projection helpers for content-pack block rows."""
from __future__ import annotations

from typing import Any, Dict

from pixsim7.backend.main.services.prompt.block.capabilities import (
    derive_block_capabilities,
    normalize_capability_ids,
)
from pixsim7.backend.main.services.prompt.block.composition_role_inference import (
    infer_composition_role,
)


def project_block_to_primitive(
    block: Dict[str, Any],
    *,
    plugin_name: str,
    content_pack_source_key: str,
) -> Dict[str, Any]:
    """Project a parsed content-pack block shape into BlockPrimitive fields."""
    tags = block.get("tags")
    if not isinstance(tags, dict):
        tags = {}
    else:
        tags = dict(tags)

    role = block.get("role")
    if isinstance(role, str):
        role = role.strip()
        if role:
            tags.setdefault("role", role)
    else:
        role = None

    legacy_category = block.get("category")
    if isinstance(legacy_category, str):
        legacy_category = legacy_category.strip()
        if legacy_category:
            tags.setdefault("legacy_category", legacy_category)

    package_name = block.get("package_name")
    if isinstance(package_name, str) and package_name.strip():
        tags.setdefault("source_pack", package_name.strip())
    else:
        tags.setdefault("source_pack", plugin_name)

    tags[content_pack_source_key] = plugin_name

    category: str | None = None
    candidate_category = block.get("category")
    if isinstance(candidate_category, str):
        candidate_category = candidate_category.strip()
        if candidate_category:
            category = candidate_category
    if not category and role:
        category = role
    if not category:
        category = "uncategorized"

    inferred_role = infer_composition_role(
        role=role,
        category=category,
        tags=tags,
    ).role_id
    if inferred_role:
        existing_role = tags.get("composition_role")
        if not (isinstance(existing_role, str) and existing_role.strip()):
            tags["composition_role"] = inferred_role

    capabilities = derive_block_capabilities(
        category=category,
        tags=tags,
        declared=normalize_capability_ids(block.get("capabilities")),
    )

    text = block.get("text")
    if not isinstance(text, str):
        text = ""

    source = block.get("source")
    if not isinstance(source, str) or not source.strip():
        source = "system"
    else:
        source = source.strip()

    is_public = block.get("is_public")
    if not isinstance(is_public, bool):
        is_public = True

    block_metadata = block.get("block_metadata")
    if isinstance(block_metadata, dict):
        block_metadata = dict(block_metadata)
    else:
        block_metadata = {}

    return {
        "block_id": block.get("block_id"),
        "category": category,
        "text": text,
        "tags": tags,
        "block_metadata": block_metadata,
        "capabilities": capabilities,
        "source": source,
        "is_public": is_public,
    }
