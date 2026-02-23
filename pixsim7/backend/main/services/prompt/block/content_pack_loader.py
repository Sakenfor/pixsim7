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

from pixsim7.backend.main.services.prompt.block.template_slots import (
    TEMPLATE_SLOT_SCHEMA_VERSION,
    normalize_template_slots,
)

logger = logging.getLogger(__name__)

CONTENT_PACKS_DIR = Path(__file__).resolve().parents[3] / "content_packs" / "prompt"
CONTENT_PACK_SOURCE_KEY = "content_pack"


class ContentPackValidationError(ValueError):
    """Raised when content-pack YAML does not match expected schema."""


# ── Field specs for each entity type ──────────────────────────────────
# {field_name: default}  — used for both create and update.
# "create_only" fields are only set on INSERT, never overwritten on UPDATE.

_BLOCK_FIELDS: Dict[str, Any] = {
    "role": None, "category": None, "kind": "single_state",
    "text": "", "tags": {}, "complexity_level": "simple",
    "package_name": None, "description": None,
    "char_count": 0, "word_count": 0,
    "style": "cinematic", "duration_sec": 1.0,
    "block_metadata": {},
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
    "render_style": None, "tags": {}, "character_metadata": {},
}
_CHARACTER_CREATE_ONLY: Dict[str, Any] = {
    "created_by": "content_pack",
}


# ── YAML parsing ────────────────────────────────────────────────────────

def _load_yaml(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ContentPackValidationError(
            f"{path}: expected top-level YAML mapping, got {type(data).__name__}"
        )
    return data


def _required_non_empty_string(
    *,
    value: Any,
    path: Path,
    section: str,
    index: int,
    field: str,
) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContentPackValidationError(
            f"{path}: {section}[{index}].{field} is required and must be a non-empty string"
        )
    return value.strip()


def _ensure_optional_dict(
    *,
    value: Any,
    path: Path,
    section: str,
    index: int,
    field: str,
) -> Dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ContentPackValidationError(
            f"{path}: {section}[{index}].{field} must be an object"
        )
    return dict(value)


def _ensure_optional_list(
    *,
    value: Any,
    path: Path,
    section: str,
    index: int,
    field: str,
) -> List[Any]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ContentPackValidationError(
            f"{path}: {section}[{index}].{field} must be a list"
        )
    return value


def _set_content_pack_source(metadata: Dict[str, Any], pack_name: str) -> Dict[str, Any]:
    stamped = dict(metadata)
    stamped[CONTENT_PACK_SOURCE_KEY] = pack_name
    return stamped


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
    if defaults is None:
        defaults = {}
    if not isinstance(defaults, dict):
        raise ContentPackValidationError(f"{blocks_path}: defaults must be an object")

    package_name = data.get("package_name")
    if package_name is not None and not isinstance(package_name, str):
        raise ContentPackValidationError(f"{blocks_path}: package_name must be a string")

    raw_blocks = data.get("blocks", [])
    if raw_blocks is None:
        raw_blocks = []
    if not isinstance(raw_blocks, list):
        raise ContentPackValidationError(f"{blocks_path}: blocks must be a list")

    blocks = []
    seen_block_ids: set[str] = set()

    for index, raw in enumerate(raw_blocks):
        if not isinstance(raw, dict):
            raise ContentPackValidationError(
                f"{blocks_path}: blocks[{index}] must be an object"
            )
        block = {**defaults, **raw}

        block_id = _required_non_empty_string(
            value=block.get("block_id"),
            path=blocks_path,
            section="blocks",
            index=index,
            field="block_id",
        )
        if block_id in seen_block_ids:
            raise ContentPackValidationError(
                f"{blocks_path}: duplicate block_id '{block_id}' in blocks[{index}]"
            )
        seen_block_ids.add(block_id)
        block["block_id"] = block_id

        if package_name and "package_name" not in raw:
            block["package_name"] = package_name

        for field_name in ("role", "category", "kind", "description", "complexity_level", "package_name", "default_intent"):
            value = block.get(field_name)
            if value is not None and not isinstance(value, str):
                raise ContentPackValidationError(
                    f"{blocks_path}: blocks[{index}].{field_name} must be a string"
                )

        tags = block.get("tags")
        if tags is None:
            block["tags"] = {}
        elif not isinstance(tags, dict):
            raise ContentPackValidationError(
                f"{blocks_path}: blocks[{index}].tags must be an object"
            )

        block_metadata = _ensure_optional_dict(
            value=block.get("block_metadata"),
            path=blocks_path,
            section="blocks",
            index=index,
            field="block_metadata",
        )
        block["block_metadata"] = _set_content_pack_source(
            block_metadata,
            content_dir.name,
        )

        text = block.get("text", "")
        if text is None:
            text = ""
        if not isinstance(text, str):
            raise ContentPackValidationError(
                f"{blocks_path}: blocks[{index}].text must be a string"
            )
        block["text"] = text
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
    raw_templates = data.get("templates", [])
    if raw_templates is None:
        raw_templates = []
    if not isinstance(raw_templates, list):
        raise ContentPackValidationError(f"{templates_path}: templates must be a list")

    templates = []
    seen_slugs: set[str] = set()

    for index, raw in enumerate(raw_templates):
        if not isinstance(raw, dict):
            raise ContentPackValidationError(
                f"{templates_path}: templates[{index}] must be an object"
            )

        slug = _required_non_empty_string(
            value=raw.get("slug"),
            path=templates_path,
            section="templates",
            index=index,
            field="slug",
        )
        if slug in seen_slugs:
            raise ContentPackValidationError(
                f"{templates_path}: duplicate slug '{slug}' in templates[{index}]"
            )
        seen_slugs.add(slug)
        raw["slug"] = slug

        for field_name in ("name", "description", "composition_strategy", "package_name"):
            value = raw.get(field_name)
            if value is not None and not isinstance(value, str):
                raise ContentPackValidationError(
                    f"{templates_path}: templates[{index}].{field_name} must be a string"
                )

        slots = _ensure_optional_list(
            value=raw.get("slots"),
            path=templates_path,
            section="templates",
            index=index,
            field="slots",
        )
        raw_metadata = _ensure_optional_dict(
            value=raw.get("template_metadata"),
            path=templates_path,
            section="templates",
            index=index,
            field="template_metadata",
        )
        slot_schema_version = raw_metadata.get("slot_schema_version")
        try:
            raw["slots"] = normalize_template_slots(slots, schema_version=slot_schema_version)
        except ValueError as exc:
            raise ContentPackValidationError(
                f"{templates_path}: templates[{index}].slots invalid: {exc}"
            ) from exc

        metadata = raw_metadata
        metadata["slot_schema_version"] = TEMPLATE_SLOT_SCHEMA_VERSION
        metadata[CONTENT_PACK_SOURCE_KEY] = content_dir.name
        raw["template_metadata"] = metadata
        templates.append(raw)

    return templates


def parse_characters(content_dir: Path) -> List[Dict[str, Any]]:
    """Parse characters.yaml."""
    chars_path = content_dir / "characters.yaml"
    if not chars_path.exists():
        return []

    data = _load_yaml(chars_path)
    raw_characters = data.get("characters", [])
    if raw_characters is None:
        raw_characters = []
    if not isinstance(raw_characters, list):
        raise ContentPackValidationError(f"{chars_path}: characters must be a list")

    characters: List[Dict[str, Any]] = []
    seen_character_ids: set[str] = set()

    for index, raw in enumerate(raw_characters):
        if not isinstance(raw, dict):
            raise ContentPackValidationError(
                f"{chars_path}: characters[{index}] must be an object"
            )

        character_id = _required_non_empty_string(
            value=raw.get("character_id"),
            path=chars_path,
            section="characters",
            index=index,
            field="character_id",
        )
        if character_id in seen_character_ids:
            raise ContentPackValidationError(
                f"{chars_path}: duplicate character_id '{character_id}' in characters[{index}]"
            )
        seen_character_ids.add(character_id)
        raw["character_id"] = character_id

        metadata = _ensure_optional_dict(
            value=raw.get("character_metadata"),
            path=chars_path,
            section="characters",
            index=index,
            field="character_metadata",
        )
        raw["character_metadata"] = _set_content_pack_source(metadata, content_dir.name)
        characters.append(raw)

    return characters


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
    metadata_field: str | None = None,
    now: datetime,
    pack_name: str,
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
        lookup_value = item.get(lookup_field)
        if lookup_value is None:
            raise ContentPackValidationError(
                f"Pack '{pack_name}': item missing required lookup field '{lookup_field}'"
            )
        attrs = _pick(item, fields)
        row = (
            await db.execute(select(model_cls).where(column == lookup_value))
        ).scalar_one_or_none()

        if row and not force:
            # If a content-pack managed entity moved between packs but kept the same
            # global ID/slug, adopt the new pack metadata without requiring force=True.
            existing_source = None
            incoming_source = None
            if metadata_field:
                existing_metadata = getattr(row, metadata_field, None)
                if isinstance(existing_metadata, dict):
                    existing_source = existing_metadata.get(CONTENT_PACK_SOURCE_KEY)
                incoming_metadata = attrs.get(metadata_field)
                if isinstance(incoming_metadata, dict):
                    incoming_source = incoming_metadata.get(CONTENT_PACK_SOURCE_KEY)

            if existing_source and incoming_source and existing_source != incoming_source:
                for k, v in attrs.items():
                    setattr(row, k, v)
                row.updated_at = now
                stats["updated"] += 1
                logger.info(
                    "content_pack_entity_rehomed",
                    entity=model_cls.__name__,
                    lookup_field=lookup_field,
                    lookup_value=str(lookup_value),
                    from_pack=existing_source,
                    to_pack=incoming_source,
                )
                continue

            stats["skipped"] += 1
            continue

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


async def _prune_missing_entities(
    db: AsyncSession,
    model_cls: Type[SQLModel],
    *,
    lookup_field: str,
    metadata_field: str,
    source_pack_name: str,
    incoming_lookup_values: List[Any],
) -> int:
    """Delete entities previously loaded from this pack but no longer in YAML."""
    lookup_column = getattr(model_cls, lookup_field)
    metadata_column = getattr(model_cls, metadata_field)

    query = select(model_cls).where(
        metadata_column.op("->>")(CONTENT_PACK_SOURCE_KEY) == source_pack_name
    )
    if incoming_lookup_values:
        query = query.where(lookup_column.notin_(incoming_lookup_values))

    result = await db.execute(query)
    stale_rows = list(result.scalars().all())
    for row in stale_rows:
        await db.delete(row)
    return len(stale_rows)


# ── Public API ───────────────────────────────────────────────────────

async def load_pack(
    db: AsyncSession,
    plugin_name: str,
    *,
    force: bool = False,
    prune_missing: bool = False,
) -> Dict[str, int]:
    """Load a single content pack into the database.

    Returns dict with keys like blocks_created, blocks_updated, blocks_skipped,
    blocks_pruned, templates_*, characters_*.
    """
    from pixsim7.backend.main.domain.prompt import PromptBlock, BlockTemplate
    from pixsim7.backend.main.domain.game.entities.character import Character

    content_dir = CONTENT_PACKS_DIR / plugin_name
    if not content_dir.exists():
        raise FileNotFoundError(f"Content pack not found: {content_dir}")

    now = datetime.now(timezone.utc)
    combined: Dict[str, int] = {}

    for prefix, model, items, fields, create_only, lookup, metadata_field in [
        ("blocks", PromptBlock, parse_blocks(content_dir),
         _BLOCK_FIELDS, _BLOCK_CREATE_ONLY, "block_id", "block_metadata"),
        ("templates", BlockTemplate, parse_templates(content_dir),
         _TEMPLATE_FIELDS, _TEMPLATE_CREATE_ONLY, "slug", "template_metadata"),
        ("characters", Character, parse_characters(content_dir),
         _CHARACTER_FIELDS, _CHARACTER_CREATE_ONLY, "character_id", "character_metadata"),
    ]:
        s = await _upsert_entities(
            db, model, items,
            lookup_field=lookup,
            fields=fields,
            create_only=create_only,
            force=force,
            metadata_field=metadata_field,
            now=now,
            pack_name=plugin_name,
        )
        combined[f"{prefix}_created"] = s["created"]
        combined[f"{prefix}_updated"] = s["updated"]
        combined[f"{prefix}_skipped"] = s["skipped"]
        combined[f"{prefix}_pruned"] = 0

        if prune_missing:
            lookup_values = [item[lookup] for item in items]
            combined[f"{prefix}_pruned"] = await _prune_missing_entities(
                db,
                model,
                lookup_field=lookup,
                metadata_field=metadata_field,
                source_pack_name=plugin_name,
                incoming_lookup_values=lookup_values,
            )

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
