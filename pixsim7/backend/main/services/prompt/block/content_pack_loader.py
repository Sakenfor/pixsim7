"""
Content-pack loader — discovers and loads blocks, templates, and characters
from content_packs/prompt/ directories into the database.

Layout:
    content_packs/prompt/<pack_name>/blocks.yaml
    content_packs/prompt/<pack_name>/templates.yaml
    content_packs/prompt/<pack_name>/characters.yaml

Auto-discovered by startup.py during optional seeding.
Also usable from CLI via scripts/load_content_pack.py.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Type
from uuid import uuid4

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

logger = logging.getLogger(__name__)

CONTENT_PACKS_DIR = Path(__file__).resolve().parents[3] / "content_packs" / "prompt"


# ── Field specs for each entity type ──────────────────────────────────
# {field_name: default}  — used for both create and update.
# "create_only" fields are only set on INSERT, never overwritten on UPDATE.

_BLOCK_FIELDS: Dict[str, Any] = {
    "role": None, "category": None, "kind": "single_state",
    "text": "", "tags": {}, "complexity_level": "simple",
    "package_name": None, "description": None,
    "char_count": 0, "word_count": 0,
    "style": "cinematic", "duration_sec": 1.0,
}
_BLOCK_CREATE_ONLY: Dict[str, Any] = {
    "source_type": "library", "curation_status": "curated",
    "is_public": True, "created_by": "content_pack",
}

_TEMPLATE_FIELDS: Dict[str, Any] = {
    "name": "", "description": None, "slots": [],
    "composition_strategy": "sequential", "package_name": None,
    "tags": [], "is_public": True,
    "character_bindings": None, "template_metadata": {},
}
_TEMPLATE_CREATE_ONLY: Dict[str, Any] = {
    "created_by": "content_pack",
}

_CHARACTER_FIELDS: Dict[str, Any] = {
    "name": None, "display_name": None, "category": "creature",
    "species": None, "archetype": None,
    "visual_traits": {}, "personality_traits": {},
    "behavioral_patterns": {}, "voice_profile": {},
    "render_style": None, "tags": {},
}
_CHARACTER_CREATE_ONLY: Dict[str, Any] = {
    "created_by": "content_pack",
}


# ── YAML parsing ────────────────────────────────────────────────────────

def _load_yaml(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def discover_content_packs() -> List[str]:
    """Return pack names under content_packs/prompt/."""
    if not CONTENT_PACKS_DIR.exists():
        return []
    return sorted(
        d.name for d in CONTENT_PACKS_DIR.iterdir()
        if d.is_dir() and (
            (d / "blocks.yaml").exists()
            or (d / "templates.yaml").exists()
            or (d / "characters.yaml").exists()
        )
    )


def parse_blocks(content_dir: Path) -> List[Dict[str, Any]]:
    """Parse blocks.yaml, merging defaults into each block."""
    blocks_path = content_dir / "blocks.yaml"
    if not blocks_path.exists():
        return []

    data = _load_yaml(blocks_path)
    defaults = data.get("defaults", {})
    package_name = data.get("package_name")
    blocks = []

    for raw in data.get("blocks", []):
        block = {**defaults, **raw}
        if package_name and "package_name" not in raw:
            block["package_name"] = package_name
        text = block.get("text", "")
        block["char_count"] = len(text)
        block["word_count"] = len(text.split())
        blocks.append(block)

    return blocks


def parse_templates(content_dir: Path) -> List[Dict[str, Any]]:
    """Parse templates.yaml, normalising slot indices."""
    templates_path = content_dir / "templates.yaml"
    if not templates_path.exists():
        return []

    data = _load_yaml(templates_path)
    templates = []

    for raw in data.get("templates", []):
        slots = []
        for i, slot in enumerate(raw.get("slots", [])):
            slot["slot_index"] = i
            slot.setdefault("selection_strategy", "uniform")
            slot.setdefault("weight", 1.0)
            slot.setdefault("optional", False)
            slots.append(slot)
        raw["slots"] = slots
        templates.append(raw)

    return templates


def parse_characters(content_dir: Path) -> List[Dict[str, Any]]:
    """Parse characters.yaml."""
    chars_path = content_dir / "characters.yaml"
    if not chars_path.exists():
        return []

    data = _load_yaml(chars_path)
    return data.get("characters", [])


# ── Generic upsert ───────────────────────────────────────────────────

def _pick(data: Dict[str, Any], field_defaults: Dict[str, Any]) -> Dict[str, Any]:
    """Extract fields from data, falling back to defaults for missing keys."""
    return {k: data.get(k, default) for k, default in field_defaults.items()}


async def _upsert_entities(
    db: AsyncSession,
    model_cls: Type[SQLModel],
    items: List[Dict[str, Any]],
    *,
    lookup_field: str,
    fields: Dict[str, Any],
    create_only: Dict[str, Any],
    force: bool,
    now: datetime,
) -> Dict[str, int]:
    """Upsert a list of YAML-parsed dicts into the given model.

    Args:
        model_cls: SQLModel class (PromptBlock, BlockTemplate, Character).
        items: Parsed YAML dicts.
        lookup_field: Unique key to match existing rows (e.g. "block_id").
        fields: {field: default} for fields that are set on both create and update.
        create_only: {field: default} for fields only set on INSERT.
        force: If True, overwrite existing rows.
        now: Timestamp for created_at / updated_at.
    """
    stats = {"created": 0, "updated": 0, "skipped": 0}
    column = getattr(model_cls, lookup_field)

    for item in items:
        lookup_value = item[lookup_field]
        row = (
            await db.execute(select(model_cls).where(column == lookup_value))
        ).scalar_one_or_none()

        if row and not force:
            stats["skipped"] += 1
            continue

        attrs = _pick(item, fields)

        if row:
            # UPDATE existing
            for k, v in attrs.items():
                setattr(row, k, v)
            row.updated_at = now
            stats["updated"] += 1
        else:
            # INSERT new
            create_attrs = _pick(item, create_only)
            entity = model_cls(
                id=uuid4(),
                **{lookup_field: lookup_value},
                **attrs,
                **create_attrs,
                created_at=now,
                updated_at=now,
            )
            db.add(entity)
            stats["created"] += 1

    return stats


# ── Public API ───────────────────────────────────────────────────────

async def load_pack(
    db: AsyncSession,
    plugin_name: str,
    *,
    force: bool = False,
) -> Dict[str, int]:
    """Load a single content pack into the database.

    Returns dict with keys like blocks_created, blocks_updated, blocks_skipped,
    templates_*, characters_*.
    """
    from pixsim7.backend.main.domain.prompt import PromptBlock, BlockTemplate
    from pixsim7.backend.main.domain.game.entities.character import Character

    content_dir = CONTENT_PACKS_DIR / plugin_name
    if not content_dir.exists():
        raise FileNotFoundError(f"Content pack not found: {content_dir}")

    now = datetime.now(timezone.utc)
    combined: Dict[str, int] = {}

    for prefix, model, items, fields, create_only, lookup in [
        ("blocks", PromptBlock, parse_blocks(content_dir),
         _BLOCK_FIELDS, _BLOCK_CREATE_ONLY, "block_id"),
        ("templates", BlockTemplate, parse_templates(content_dir),
         _TEMPLATE_FIELDS, _TEMPLATE_CREATE_ONLY, "slug"),
        ("characters", Character, parse_characters(content_dir),
         _CHARACTER_FIELDS, _CHARACTER_CREATE_ONLY, "character_id"),
    ]:
        s = await _upsert_entities(
            db, model, items,
            lookup_field=lookup,
            fields=fields,
            create_only=create_only,
            force=force,
            now=now,
        )
        combined[f"{prefix}_created"] = s["created"]
        combined[f"{prefix}_updated"] = s["updated"]
        combined[f"{prefix}_skipped"] = s["skipped"]

    await db.commit()
    return combined


async def seed_content_packs(db: AsyncSession) -> int:
    """Auto-discover and load all content packs. Skip-existing by default."""
    packs = discover_content_packs()
    if not packs:
        return 0

    total_created = 0
    for pack_name in packs:
        try:
            stats = await load_pack(db, pack_name, force=False)
            created = (
                stats["blocks_created"]
                + stats["templates_created"]
                + stats["characters_created"]
            )
            total_created += created
            if created:
                logger.info(
                    "content_pack_loaded",
                    pack=pack_name,
                    **{k: v for k, v in stats.items() if v},
                )
        except Exception as e:
            logger.warning(
                "content_pack_load_failed",
                pack=pack_name,
                error=str(e),
            )

    return total_created
