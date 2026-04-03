"""Primitive loader — reads YAML and upserts into block_primitives table.

Supports two layouts per pack:
  - Single file:  ``<pack>/blocks.yaml``
  - Fragments:    ``<pack>/blocks/*.yaml`` (merged in sorted order)

If both exist, the single file is loaded first, then fragments are merged in.

Uses the separate pixsim7_blocks database via get_async_blocks_session().
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.blocks import BlockPrimitive
from pixsim7.backend.main.infrastructure.database.session import get_async_blocks_session
from pixsim7.backend.main.services.prompt.block.capabilities import (
    derive_block_capabilities,
    normalize_capability_ids,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# YAML parsing
# ---------------------------------------------------------------------------


def _parse_blocks_from_yaml(yaml_path: Path) -> List[Dict[str, Any]]:
    """Parse a single YAML file and return its block list.

    Each file must have a top-level ``blocks`` list.  An optional
    ``package_name`` is carried through for provenance.
    """
    with open(yaml_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if not isinstance(data, dict):
        raise ValueError(f"Expected a YAML mapping at top level in {yaml_path}")

    blocks = data.get("blocks")
    if not isinstance(blocks, list):
        raise ValueError(f"Expected 'blocks' list in {yaml_path}")

    package_name = data.get("package_name")

    parsed: List[Dict[str, Any]] = []
    for i, block in enumerate(blocks):
        if not isinstance(block, dict):
            raise ValueError(f"Block #{i} in {yaml_path} is not a mapping")

        block_id = block.get("block_id")
        if not block_id or not isinstance(block_id, str):
            raise ValueError(f"Block #{i} in {yaml_path} missing or invalid 'block_id'")

        category = block.get("category")
        if not category or not isinstance(category, str):
            raise ValueError(f"Block '{block_id}' missing or invalid 'category'")

        text = block.get("text")
        if not text or not isinstance(text, str):
            raise ValueError(f"Block '{block_id}' missing or invalid 'text'")

        tags = block.get("tags", {})
        if not isinstance(tags, dict):
            raise ValueError(f"Block '{block_id}' has invalid 'tags' (expected mapping)")

        # Normalize tag values to strings (YAML may parse as int/bool)
        normalized_tags = {str(k): str(v) for k, v in tags.items()}

        declared_capabilities = normalize_capability_ids(block.get("capabilities"))
        capabilities = derive_block_capabilities(
            category=category,
            tags=normalized_tags,
            declared=declared_capabilities,
        )

        parsed.append({
            "block_id": block_id,
            "category": category,
            "text": text,
            "tags": normalized_tags,
            "capabilities": capabilities,
            "source": "system",
            "is_public": block.get("is_public", True),
            "_package_name": package_name,
            "_source_file": str(yaml_path),
        })

    return parsed


def _collect_pack_primitives(pack_dir: Path) -> List[Dict[str, Any]]:
    """Collect all primitives from a pack directory.

    Supports:
      - ``blocks.yaml`` (single file at pack root)
      - ``blocks/*.yaml`` (fragment files, merged in sorted order)

    If both exist, single file is loaded first, then fragments.
    Validates block_id uniqueness across all sources.
    """
    all_primitives: List[Dict[str, Any]] = []
    sources: List[Path] = []

    # Single file
    single = pack_dir / "blocks.yaml"
    if single.exists():
        sources.append(single)

    # Fragment directory
    blocks_dir = pack_dir / "blocks"
    if blocks_dir.is_dir():
        for fragment in sorted(blocks_dir.glob("*.yaml")):
            sources.append(fragment)
        for fragment in sorted(blocks_dir.glob("*.yml")):
            sources.append(fragment)

    if not sources:
        return []

    seen_ids: set[str] = set()
    for source_path in sources:
        primitives = _parse_blocks_from_yaml(source_path)
        for p in primitives:
            bid = p["block_id"]
            if bid in seen_ids:
                raise ValueError(
                    f"Duplicate block_id '{bid}' in {source_path} "
                    f"(already defined in another file in {pack_dir.name})"
                )
            seen_ids.add(bid)
        all_primitives.extend(primitives)

    return all_primitives


def _parse_manifest(pack_dir: Path) -> Optional[Dict[str, Any]]:
    """Read manifest.yaml if present. Returns None if not found."""
    for name in ("manifest.yaml", "manifest.yml"):
        path = pack_dir / name
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            return data if isinstance(data, dict) else None
    return None


# ---------------------------------------------------------------------------
# DB upsert
# ---------------------------------------------------------------------------


async def _upsert_primitives(
    db: AsyncSession,
    primitives: List[Dict[str, Any]],
) -> Dict[str, int]:
    """Upsert primitives into block_primitives table. Returns stats."""
    stats = {"created": 0, "updated": 0, "skipped": 0}
    now = datetime.now(timezone.utc)

    for item in primitives:
        block_id = item["block_id"]
        row = (
            await db.execute(
                select(BlockPrimitive).where(BlockPrimitive.block_id == block_id)
            )
        ).scalar_one_or_none()

        if row is not None:
            row.category = item["category"]
            row.text = item["text"]
            row.tags = item["tags"]
            row.capabilities = item["capabilities"]
            row.source = item["source"]
            row.is_public = item["is_public"]
            row.updated_at = now
            stats["updated"] += 1
        else:
            entity = BlockPrimitive(
                id=uuid4(),
                block_id=block_id,
                category=item["category"],
                text=item["text"],
                tags=item["tags"],
                capabilities=item["capabilities"],
                source=item["source"],
                is_public=item["is_public"],
                created_at=now,
                updated_at=now,
            )
            db.add(entity)
            stats["created"] += 1

    await db.commit()
    return stats


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def load_primitives_pack(pack_dir: Path) -> Dict[str, Any]:
    """Load all primitives from a pack directory into block_primitives table.

    Reads manifest.yaml for metadata, collects blocks from blocks.yaml
    and/or blocks/*.yaml fragments, and upserts into the blocks DB.

    Returns a result dict with manifest info and upsert stats.
    """
    pack_dir = Path(pack_dir)
    if not pack_dir.is_dir():
        raise FileNotFoundError(f"Pack directory not found: {pack_dir}")

    manifest = _parse_manifest(pack_dir)
    primitives = _collect_pack_primitives(pack_dir)

    if not primitives:
        logger.info("primitive_loader_empty", pack=pack_dir.name)
        return {"pack": pack_dir.name, "manifest": manifest, "count": 0}

    logger.info(
        "primitive_loader_parsed",
        pack=pack_dir.name,
        count=len(primitives),
    )

    async with get_async_blocks_session() as db:
        stats = await _upsert_primitives(db, primitives)

    logger.info(
        "primitive_loader_done",
        pack=pack_dir.name,
        created_count=stats["created"],
        updated=stats["updated"],
    )

    return {
        "pack": pack_dir.name,
        "manifest": manifest,
        "count": len(primitives),
        **stats,
    }


async def load_all_primitives(content_packs_dir: Path) -> Dict[str, Any]:
    """Scan content_packs/primitives/*/ and load all packs found.

    Returns a summary dict keyed by pack directory name.
    """
    primitives_dir = content_packs_dir / "primitives"
    if not primitives_dir.exists():
        return {}

    results: Dict[str, Any] = {}
    for pack_dir in sorted(primitives_dir.iterdir()):
        if not pack_dir.is_dir():
            continue
        try:
            result = await load_primitives_pack(pack_dir)
            results[pack_dir.name] = result
        except Exception as exc:
            logger.error(
                "primitive_loader_error",
                pack=pack_dir.name,
                error=str(exc),
                exc_info=True,
            )
            results[pack_dir.name] = {"error": str(exc)}

    return results
