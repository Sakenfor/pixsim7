"""
Content-pack loader — discovers and loads blocks, templates, and characters
from content_packs/prompt/ directories into the database.

Layout:
    Block schemas (required for blocks):
        content_packs/prompt/<pack_name>/schema.yaml
        content_packs/prompt/<pack_name>/blocks.schema.yaml
        content_packs/prompt/<pack_name>/blocks/**/*.schema.yaml
        where schema entries use `blocks[].block_schema` (top-level `block_schema`
        is no longer supported)

    Single-file:
        content_packs/prompt/<pack_name>/templates.yaml
        content_packs/prompt/<pack_name>/characters.yaml

    Multi-file (authoring convenience):
        content_packs/prompt/<pack_name>/templates/*.yaml
        content_packs/prompt/<pack_name>/characters/*.yaml

    For blocks, legacy ``blocks.yaml`` and ``blocks/*.yaml`` sources are not loaded.

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
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.blocks import BlockPrimitive
from pixsim7.backend.main.infrastructure.database.session import get_async_blocks_session
from pixsim7.backend.main.shared.path_registry import get_path_registry
from pixsim7.backend.main.services.prompt.block.template_controls import (
    expand_control_presets,
)
from pixsim7.backend.main.services.prompt.block.template_features import (
    expand_template_feature_presets,
)
from pixsim7.backend.main.services.prompt.block.capabilities import (
    derive_block_capabilities,
    normalize_capability_ids,
)
from pixsim7.backend.main.services.prompt.block.op_signatures import (
    get_op_signature,
    validate_signature_contract,
)
from pixsim7.backend.main.services.prompt.block.template_slots import (
    TEMPLATE_SLOT_SCHEMA_VERSION,
    normalize_template_slots,
)
from pixsim7.backend.main.services.prompt.block.family_contract_validation import (
    BlockFamilyContractValidationError,
    load_prompt_block_family_schemas,
    load_prompt_block_tag_keys,
    validate_block_family_contract,
    validate_template_slots_family_contracts,
)

logger = logging.getLogger(__name__)

CONTENT_PACKS_DIR = get_path_registry().prompt_content_packs_dir
CONTENT_PACK_SOURCE_KEY = "content_pack"
_YAML_SUFFIXES = (".yaml", ".yml")
_BLOCK_SCHEMA_FILENAMES = (
    "schema.yaml",
    "schema.yml",
    "blocks.schema.yaml",
    "blocks.schema.yml",
)
_BLOCK_SCHEMA_FRAGMENT_SUFFIXES = (
    ".schema.yaml",
    ".schema.yml",
)


class ContentPackValidationError(ValueError):
    """Raised when content-pack YAML does not match expected schema."""


# ── Field specs for each entity type ──────────────────────────────────
# {field_name: default}  — used for both create and update.
# "create_only" fields are only set on INSERT, never overwritten on UPDATE.

_BLOCK_FIELDS: Dict[str, Any] = {
    "category": "uncategorized",
    "text": "",
    "tags": {},
    "capabilities": [],
    "source": "system",
    "is_public": True,
}
_BLOCK_CREATE_ONLY: Dict[str, Any] = {
    "avg_rating": None,
    "usage_count": 0,
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


def _iter_pack_sources(content_dir: Path, stem: str) -> List[Path]:
    """Return ordered YAML sources for a pack section (blocks/templates/characters)."""
    if stem == "blocks":
        sources: List[Path] = []
        for filename in _BLOCK_SCHEMA_FILENAMES:
            schema_source = content_dir / filename
            if schema_source.exists():
                sources.append(schema_source)
        fragments_dir = content_dir / stem
        if fragments_dir.is_dir():
            fragments: List[Path] = []
            for suffix in _BLOCK_SCHEMA_FRAGMENT_SUFFIXES:
                fragments.extend(
                    p
                    for p in fragments_dir.rglob(f"*{suffix}")
                    if p.is_file()
                )
            sources.extend(sorted(fragments))
        return sources

    sources: List[Path] = []
    # Prefer .yaml, then .yml; include at most one single-file source.
    for suffix in _YAML_SUFFIXES:
        single = content_dir / f"{stem}{suffix}"
        if single.exists():
            sources.append(single)
            break

    # Merge in fragments from <stem>/ directory (if present).
    fragments_dir = content_dir / stem
    if fragments_dir.is_dir():
        fragments: List[Path] = []
        for suffix in _YAML_SUFFIXES:
            fragments.extend(
                p
                for p in fragments_dir.rglob(f"*{suffix}")
                if p.is_file()
            )
        sources.extend(sorted(fragments))

    return sources


def _has_any_pack_source(content_dir: Path, stem: str) -> bool:
    if stem == "blocks":
        if any((content_dir / name).exists() for name in _BLOCK_SCHEMA_FILENAMES):
            return True
        fragments_dir = content_dir / stem
        if not fragments_dir.is_dir():
            return False
        return any(
            f.is_file() and any(f.name.endswith(suffix) for suffix in _BLOCK_SCHEMA_FRAGMENT_SUFFIXES)
            for f in fragments_dir.rglob("*")
        )

    if any((content_dir / f"{stem}{suffix}").exists() for suffix in _YAML_SUFFIXES):
        return True
    fragments_dir = content_dir / stem
    if not fragments_dir.is_dir():
        return False
    return any(
        f.is_file() and f.suffix in _YAML_SUFFIXES
        for f in fragments_dir.rglob("*")
    )


def _iter_legacy_block_sources(content_dir: Path) -> List[Path]:
    """Return legacy prompt block files that are no longer supported."""
    legacy: List[Path] = []
    for suffix in _YAML_SUFFIXES:
        single = content_dir / f"blocks{suffix}"
        if single.exists():
            legacy.append(single)

    blocks_dir = content_dir / "blocks"
    if blocks_dir.is_dir():
        for suffix in _YAML_SUFFIXES:
            legacy.extend(
                p
                for p in blocks_dir.rglob(f"*{suffix}")
                if p.is_file()
                and not any(p.name.endswith(schema_suffix) for schema_suffix in _BLOCK_SCHEMA_FRAGMENT_SUFFIXES)
            )
    return sorted(legacy)


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


def _ensure_optional_string(
    *,
    value: Any,
    path: Path,
    field: str,
) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ContentPackValidationError(f"{path}: {field} must be a string")
    value = value.strip()
    return value or None


def _set_content_pack_source(metadata: Dict[str, Any], pack_name: str) -> Dict[str, Any]:
    stamped = dict(metadata)
    stamped[CONTENT_PACK_SOURCE_KEY] = pack_name
    return stamped


def discover_content_packs() -> List[str]:
    """Return pack names under content_packs/prompt/.

    Directories whose name starts with ``_`` (e.g. ``_archived``) are skipped.
    """
    if not CONTENT_PACKS_DIR.exists():
        return []
    return sorted(
        d.name for d in CONTENT_PACKS_DIR.iterdir()
        if d.is_dir() and not d.name.startswith("_") and (
            _has_any_pack_source(d, "blocks")
            or _has_any_pack_source(d, "templates")
            or _has_any_pack_source(d, "characters")
        )
    )


def parse_blocks(content_dir: Path) -> List[Dict[str, Any]]:
    """Parse block schema sources, merging defaults into each block."""
    legacy_sources = _iter_legacy_block_sources(content_dir)
    if legacy_sources:
        source_list = ", ".join(str(path.name) for path in legacy_sources[:5])
        if len(legacy_sources) > 5:
            source_list = f"{source_list}, ..."
        raise ContentPackValidationError(
            f"{content_dir}: found unsupported legacy block source(s): {source_list}. "
            "Use schema.yaml, blocks.schema.yaml, or blocks/**/*.schema.yaml."
        )

    sources = _iter_pack_sources(content_dir, "blocks")
    if not sources:
        return []

    # Pack-level defaults can be provided by the first root schema source and
    # apply to all schema fragment files too.
    pack_defaults: Dict[str, Any] = {}
    pack_defaults_source: Path | None = None
    pack_package_name: str | None = None
    pack_package_name_source: Path | None = None

    # First pass: validate and capture pack-level package_name consistency.
    for src in sources:
        data = _load_yaml(src)

        src_package_name = data.get("package_name")
        if src_package_name is not None and not isinstance(src_package_name, str):
            raise ContentPackValidationError(f"{src}: package_name must be a string")
        if isinstance(src_package_name, str):
            if pack_package_name is None:
                pack_package_name = src_package_name
                pack_package_name_source = src
            elif src_package_name != pack_package_name:
                raise ContentPackValidationError(
                    f"{src}: package_name '{src_package_name}' conflicts with '{pack_package_name}' from {pack_package_name_source}"
                )

        # Treat the first root schema source as pack defaults (if present).
        if (
            pack_defaults_source is None
            and src.parent == content_dir
            and src.name in _BLOCK_SCHEMA_FILENAMES
        ):
            defaults = data.get("defaults", {})
            if defaults is None:
                defaults = {}
            if not isinstance(defaults, dict):
                raise ContentPackValidationError(f"{src}: defaults must be an object")
            pack_defaults = dict(defaults)
            pack_defaults_source = src

    blocks: List[Dict[str, Any]] = []
    seen_block_ids: Dict[str, Path] = {}
    family_schemas = load_prompt_block_family_schemas()

    for src in sources:
        data = _load_yaml(src)

        defaults = data.get("defaults", {})
        if defaults is None:
            defaults = {}
        if not isinstance(defaults, dict):
            raise ContentPackValidationError(f"{src}: defaults must be an object")

        raw_blocks = data.get("blocks", [])
        if raw_blocks is None:
            raw_blocks = []
        if not isinstance(raw_blocks, list):
            raise ContentPackValidationError(f"{src}: blocks must be a list")
        if data.get("block_schema") is not None:
            raise ContentPackValidationError(
                f"{src}: top-level block_schema is no longer supported; use blocks[].block_schema"
            )

        expanded_blocks: List[Dict[str, Any]] = []
        for block_index, raw_block in enumerate(raw_blocks):
            if not isinstance(raw_block, dict):
                raise ContentPackValidationError(
                    f"{src}: blocks[{block_index}] must be an object"
                )

            if "block_schema" not in raw_block:
                expanded_blocks.append(dict(raw_block))
                continue

            schema_id = raw_block.get("id")
            if schema_id is not None and (not isinstance(schema_id, str) or not schema_id.strip()):
                raise ContentPackValidationError(
                    f"{src}: blocks[{block_index}].id must be a non-empty string"
                )
            schema_id_text = schema_id.strip() if isinstance(schema_id, str) else None

            schema_group = raw_block.get("group")
            if schema_group is not None and (not isinstance(schema_group, str) or not schema_group.strip()):
                raise ContentPackValidationError(
                    f"{src}: blocks[{block_index}].group must be a non-empty string"
                )
            schema_group_text = schema_group.strip() if isinstance(schema_group, str) else None

            schema_defaults = raw_block.get("defaults", {})
            if schema_defaults is None:
                schema_defaults = {}
            if not isinstance(schema_defaults, dict):
                raise ContentPackValidationError(
                    f"{src}: blocks[{block_index}].defaults must be an object"
                )

            schema_block = raw_block.get("block_schema")
            if not isinstance(schema_block, dict):
                raise ContentPackValidationError(
                    f"{src}: blocks[{block_index}].block_schema must be an object"
                )

            reserved_keys = {"id", "group", "defaults", "block_schema"}
            entry_overrides = {
                key: value
                for key, value in raw_block.items()
                if key not in reserved_keys
            }
            compiled_blocks = _compile_schema_blocks(block_schema=schema_block, src=src)

            for compiled in compiled_blocks:
                expanded = {**schema_defaults, **entry_overrides, **compiled}

                if schema_id_text is not None or schema_group_text is not None:
                    tags = expanded.get("tags")
                    if tags is None:
                        expanded_tags: Dict[str, Any] = {}
                    elif not isinstance(tags, dict):
                        raise ContentPackValidationError(
                            f"{src}: blocks[{block_index}].block_schema produces non-object tags"
                        )
                    else:
                        expanded_tags = dict(tags)

                    metadata = expanded.get("block_metadata")
                    if metadata is None:
                        expanded_metadata: Dict[str, Any] = {}
                    elif not isinstance(metadata, dict):
                        raise ContentPackValidationError(
                            f"{src}: blocks[{block_index}].block_schema produces non-object block_metadata"
                        )
                    else:
                        expanded_metadata = dict(metadata)

                    if schema_id_text is not None:
                        expanded_metadata.setdefault("schema_block_id", schema_id_text)
                    if schema_group_text is not None:
                        expanded_tags.setdefault("schema_group", schema_group_text)
                        expanded_metadata.setdefault("schema_group", schema_group_text)

                    expanded["tags"] = expanded_tags
                    expanded["block_metadata"] = expanded_metadata

                expanded_blocks.append(expanded)

        raw_blocks = expanded_blocks

        effective_defaults = {**pack_defaults, **defaults}

        for index, raw in enumerate(raw_blocks):
            if not isinstance(raw, dict):
                raise ContentPackValidationError(
                    f"{src}: blocks[{index}] must be an object"
                )
            block = {**effective_defaults, **raw}

            block_id = _required_non_empty_string(
                value=block.get("block_id"),
                path=src,
                section="blocks",
                index=index,
                field="block_id",
            )
            if block_id in seen_block_ids:
                raise ContentPackValidationError(
                    f"{src}: duplicate block_id '{block_id}' in blocks[{index}] (already defined in {seen_block_ids[block_id]})"
                )
            seen_block_ids[block_id] = src
            block["block_id"] = block_id

            if pack_package_name and "package_name" not in raw:
                block["package_name"] = pack_package_name

            for field_name in ("role", "category", "kind", "description", "complexity_level", "package_name", "default_intent"):
                value = block.get(field_name)
                if value is not None and not isinstance(value, str):
                    raise ContentPackValidationError(
                        f"{src}: blocks[{index}].{field_name} must be a string"
                    )
            raw_capabilities = block.get("capabilities")
            if raw_capabilities is not None and not isinstance(raw_capabilities, (str, list)):
                raise ContentPackValidationError(
                    f"{src}: blocks[{index}].capabilities must be a string or list"
                )
            block["capabilities"] = normalize_capability_ids(raw_capabilities)

            tags = block.get("tags")
            if tags is None:
                block_tags: Dict[str, Any] = {}
            elif not isinstance(tags, dict):
                raise ContentPackValidationError(
                    f"{src}: blocks[{index}].tags must be an object"
                )
            else:
                block_tags = dict(tags)

            try:
                validate_block_family_contract(
                    block=block,
                    path=src,
                    index=index,
                    family_schemas=family_schemas,
                )
            except BlockFamilyContractValidationError as exc:
                raise ContentPackValidationError(str(exc)) from exc

            role_value = block.get("role")
            if isinstance(role_value, str):
                role_value = role_value.strip()
                if role_value:
                    block_tags.setdefault("role", role_value)

            category_value = block.get("category")
            if isinstance(category_value, str):
                category_value = category_value.strip()
                if category_value:
                    block_tags.setdefault("legacy_category", category_value)

            package_value = block.get("package_name")
            if isinstance(package_value, str) and package_value.strip():
                block_tags.setdefault("source_pack", package_value.strip())
            else:
                block_tags.setdefault("source_pack", content_dir.name)

            duration_value = block.get("duration_sec")
            if duration_value is not None:
                block_tags.setdefault("duration_sec", duration_value)

            block_tags[CONTENT_PACK_SOURCE_KEY] = content_dir.name
            block["tags"] = block_tags

            block_metadata = _ensure_optional_dict(
                value=block.get("block_metadata"),
                path=src,
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
                    f"{src}: blocks[{index}].text must be a string"
                )
            block["text"] = text
            block["char_count"] = len(text)
            block["word_count"] = len(text.split())
            blocks.append(block)

    return blocks


def _compile_schema_blocks(*, block_schema: Any, src: Path) -> List[Dict[str, Any]]:
    """Compile schema-first block definitions into normalized block objects.

    Supported shape:
      block_schema:
        id_prefix: core.camera.motion
        text_template: "Camera motion token: {variant}."
        category: camera
        role: camera
        capabilities: [camera.motion]
        tags: {modifier_family: camera_motion}
        variants:
          - key: zoom
            tags: {camera_motion: zoom}
    """
    def _normalize_op_modalities(*, value: Any, field: str) -> List[str]:
        if value is None:
            return []
        if not isinstance(value, list) or not value:
            raise ContentPackValidationError(f"{src}: {field} must be a non-empty list")

        normalized: List[str] = []
        for idx, raw in enumerate(value):
            if not isinstance(raw, str) or not raw.strip():
                raise ContentPackValidationError(
                    f"{src}: {field}[{idx}] must be a non-empty string"
                )
            token = raw.strip().lower()
            if token not in {"image", "video", "both"}:
                raise ContentPackValidationError(
                    f"{src}: {field}[{idx}] must be one of: image, video, both"
                )
            if token == "both":
                for expanded in ("image", "video"):
                    if expanded not in normalized:
                        normalized.append(expanded)
            elif token not in normalized:
                normalized.append(token)
        return normalized

    def _derive_modality_support_tag(modalities: List[str]) -> str | None:
        has_image = "image" in modalities
        has_video = "video" in modalities
        if has_image and has_video:
            return "both"
        if has_image:
            return "image"
        if has_video:
            return "video"
        return None

    def _normalize_block_mode(*, value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str) or not value.strip():
            raise ContentPackValidationError(
                f"{src}: block_schema.mode must be one of: surface, hybrid, op"
            )
        mode = value.strip().lower()
        if mode not in {"surface", "hybrid", "op"}:
            raise ContentPackValidationError(
                f"{src}: block_schema.mode must be one of: surface, hybrid, op"
            )
        return mode

    def _normalize_descriptors_map(*, value: Any, field: str) -> Dict[str, Any]:
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise ContentPackValidationError(f"{src}: {field} must be an object")
        normalized: Dict[str, Any] = {}
        for raw_key, raw_value in value.items():
            key_text = str(raw_key).strip()
            if not key_text:
                raise ContentPackValidationError(
                    f"{src}: {field} keys must be non-empty strings"
                )
            normalized[key_text] = raw_value
        return normalized

    def _normalize_schema_op(*, value: Any) -> Dict[str, Any] | None:
        if value is None:
            return None
        if not isinstance(value, dict):
            raise ContentPackValidationError(f"{src}: block_schema.op must be an object")

        op_id = value.get("op_id")
        if op_id is not None and (not isinstance(op_id, str) or not op_id.strip()):
            raise ContentPackValidationError(f"{src}: block_schema.op.op_id must be a non-empty string")
        op_id_text = op_id.strip() if isinstance(op_id, str) else None

        op_id_template = value.get("op_id_template")
        if op_id_template is not None and (not isinstance(op_id_template, str) or not op_id_template.strip()):
            raise ContentPackValidationError(
                f"{src}: block_schema.op.op_id_template must be a non-empty string"
            )
        op_id_template_text = op_id_template.strip() if isinstance(op_id_template, str) else None

        if bool(op_id_text) == bool(op_id_template_text):
            raise ContentPackValidationError(
                f"{src}: block_schema.op requires exactly one of op_id or op_id_template"
            )

        signature_id = value.get("signature_id")
        if signature_id is not None and (not isinstance(signature_id, str) or not signature_id.strip()):
            raise ContentPackValidationError(
                f"{src}: block_schema.op.signature_id must be a non-empty string"
            )
        signature_id_text = signature_id.strip() if isinstance(signature_id, str) else None

        refs = value.get("refs")
        normalized_refs: List[Dict[str, Any]] = []
        if refs is not None:
            if not isinstance(refs, list):
                raise ContentPackValidationError(f"{src}: block_schema.op.refs must be a list")
            for idx, raw_ref in enumerate(refs):
                if not isinstance(raw_ref, dict):
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.refs[{idx}] must be an object"
                    )
                ref_key = raw_ref.get("key")
                if not isinstance(ref_key, str) or not ref_key.strip():
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.refs[{idx}].key must be a non-empty string"
                    )
                ref_capability = raw_ref.get("capability")
                if not isinstance(ref_capability, str) or not ref_capability.strip():
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.refs[{idx}].capability must be a non-empty string"
                    )
                required = raw_ref.get("required", False)
                if not isinstance(required, bool):
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.refs[{idx}].required must be a boolean"
                    )
                many = raw_ref.get("many", False)
                if not isinstance(many, bool):
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.refs[{idx}].many must be a boolean"
                    )
                description = raw_ref.get("description")
                if description is not None and not isinstance(description, str):
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.refs[{idx}].description must be a string"
                    )

                normalized_ref = dict(raw_ref)
                normalized_ref["key"] = ref_key.strip()
                normalized_ref["capability"] = ref_capability.strip()
                normalized_ref["required"] = required
                normalized_ref["many"] = many
                normalized_refs.append(normalized_ref)

        params = value.get("params")
        normalized_params: List[Dict[str, Any]] = []
        if params is not None:
            if not isinstance(params, list):
                raise ContentPackValidationError(f"{src}: block_schema.op.params must be a list")
            for idx, raw_param in enumerate(params):
                if not isinstance(raw_param, dict):
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.params[{idx}] must be an object"
                    )

                param_key = raw_param.get("key")
                if not isinstance(param_key, str) or not param_key.strip():
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.params[{idx}].key must be a non-empty string"
                    )
                param_type = raw_param.get("type")
                if not isinstance(param_type, str) or not param_type.strip():
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.params[{idx}].type must be a non-empty string"
                    )
                param_type = param_type.strip().lower()
                if param_type not in {"string", "number", "integer", "boolean", "enum", "ref"}:
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.params[{idx}].type must be one of: string, number, integer, boolean, enum, ref"
                    )

                required = raw_param.get("required", False)
                if not isinstance(required, bool):
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.params[{idx}].required must be a boolean"
                    )
                description = raw_param.get("description")
                if description is not None and not isinstance(description, str):
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.params[{idx}].description must be a string"
                    )

                enum_values = raw_param.get("enum")
                if enum_values is not None:
                    if not isinstance(enum_values, list) or not enum_values:
                        raise ContentPackValidationError(
                            f"{src}: block_schema.op.params[{idx}].enum must be a non-empty list"
                        )
                    for enum_index, enum_item in enumerate(enum_values):
                        if not isinstance(enum_item, str) or not enum_item.strip():
                            raise ContentPackValidationError(
                                f"{src}: block_schema.op.params[{idx}].enum[{enum_index}] must be a non-empty string"
                            )

                if param_type == "enum" and enum_values is None:
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.params[{idx}] type=enum requires enum values"
                    )

                ref_capability = raw_param.get("ref_capability")
                if param_type == "ref":
                    if not isinstance(ref_capability, str) or not ref_capability.strip():
                        raise ContentPackValidationError(
                            f"{src}: block_schema.op.params[{idx}] type=ref requires ref_capability"
                        )
                elif ref_capability is not None and not isinstance(ref_capability, str):
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.params[{idx}].ref_capability must be a string"
                    )

                minimum = raw_param.get("minimum")
                if minimum is not None and not isinstance(minimum, (int, float)):
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.params[{idx}].minimum must be a number"
                    )
                maximum = raw_param.get("maximum")
                if maximum is not None and not isinstance(maximum, (int, float)):
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.params[{idx}].maximum must be a number"
                    )

                normalized_param = dict(raw_param)
                normalized_param["key"] = param_key.strip()
                normalized_param["type"] = param_type
                normalized_param["required"] = required
                if enum_values is not None:
                    normalized_param["enum"] = [str(item).strip() for item in enum_values]
                if isinstance(ref_capability, str):
                    normalized_param["ref_capability"] = ref_capability.strip()
                normalized_params.append(normalized_param)

        default_args = value.get("default_args")
        if default_args is None:
            normalized_default_args: Dict[str, Any] = {}
        else:
            if not isinstance(default_args, dict):
                raise ContentPackValidationError(f"{src}: block_schema.op.default_args must be an object")
            normalized_default_args = {}
            for raw_key, raw_value in default_args.items():
                key_text = str(raw_key).strip()
                if not key_text:
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.default_args keys must be non-empty strings"
                    )
                normalized_default_args[key_text] = raw_value

        modalities = _normalize_op_modalities(value=value.get("modalities"), field="block_schema.op.modalities")
        if signature_id_text is not None:
            signature = get_op_signature(signature_id_text)
            if signature is None:
                raise ContentPackValidationError(
                    f"{src}: block_schema.op.signature_id '{signature_id_text}' is not registered"
                )
            signature_errors = validate_signature_contract(
                signature=signature,
                op_id=op_id_text,
                op_id_template=op_id_template_text,
                params=normalized_params,
                refs=normalized_refs,
                modalities=modalities,
            )
            if signature_errors:
                details = "; ".join(signature_errors)
                raise ContentPackValidationError(
                    f"{src}: block_schema.op does not satisfy signature '{signature_id_text}': {details}"
                )

        normalized_op: Dict[str, Any] = {}
        for key, entry in value.items():
            if key in {"op_id", "op_id_template", "signature_id", "modalities", "refs", "params", "default_args"}:
                continue
            normalized_op[key] = entry

        if op_id_text is not None:
            normalized_op["op_id"] = op_id_text
        if op_id_template_text is not None:
            normalized_op["op_id_template"] = op_id_template_text
        if signature_id_text is not None:
            normalized_op["signature_id"] = signature_id_text

        if modalities:
            normalized_op["modalities"] = modalities
        if normalized_refs:
            normalized_op["refs"] = normalized_refs
        if normalized_params:
            normalized_op["params"] = normalized_params
        if normalized_default_args:
            normalized_op["default_args"] = normalized_default_args
        return normalized_op

    if block_schema is None:
        return []
    if not isinstance(block_schema, dict):
        raise ContentPackValidationError(f"{src}: block_schema must be an object")

    id_prefix = block_schema.get("id_prefix")
    if not isinstance(id_prefix, str) or not id_prefix.strip():
        raise ContentPackValidationError(f"{src}: block_schema.id_prefix must be a non-empty string")
    id_prefix = id_prefix.strip().rstrip(".")
    if not id_prefix:
        raise ContentPackValidationError(f"{src}: block_schema.id_prefix must not be empty")

    text_template = block_schema.get("text_template")
    if text_template is not None and not isinstance(text_template, str):
        raise ContentPackValidationError(f"{src}: block_schema.text_template must be a string")

    base_descriptors = _normalize_descriptors_map(
        value=block_schema.get("descriptors"),
        field="block_schema.descriptors",
    )

    base_tags = block_schema.get("tags", {})
    if base_tags is None:
        base_tags = {}
    if not isinstance(base_tags, dict):
        raise ContentPackValidationError(f"{src}: block_schema.tags must be an object")

    variants = block_schema.get("variants")
    if not isinstance(variants, list) or not variants:
        raise ContentPackValidationError(f"{src}: block_schema.variants must be a non-empty list")

    schema_op = _normalize_schema_op(value=block_schema.get("op"))
    block_mode = _normalize_block_mode(value=block_schema.get("mode"))
    if block_mode is None:
        declares_ops = schema_op is not None or any(
            isinstance(item, dict)
            and any(field in item for field in ("op_id", "op_modalities", "op_args", "ref_bindings"))
            for item in variants
        )
        if declares_ops:
            has_text_template = isinstance(text_template, str)
            has_variant_text = any(
                isinstance(item, dict)
                and isinstance(item.get("text"), str)
                and bool(item.get("text").strip())
                for item in variants
            )
            block_mode = "hybrid" if has_text_template or has_variant_text else "op"
        else:
            block_mode = "surface"

    reserved_schema_keys = {"id_prefix", "mode", "text_template", "descriptors", "tags", "variants", "op"}
    base_block = {k: v for k, v in block_schema.items() if k not in reserved_schema_keys}

    compiled: List[Dict[str, Any]] = []
    for i, variant in enumerate(variants):
        if not isinstance(variant, dict):
            raise ContentPackValidationError(f"{src}: block_schema.variants[{i}] must be an object")

        variant_key_raw = variant.get("key", variant.get("id"))
        if not isinstance(variant_key_raw, str) or not variant_key_raw.strip():
            raise ContentPackValidationError(
                f"{src}: block_schema.variants[{i}].key is required and must be a non-empty string"
            )
        variant_key = variant_key_raw.strip()

        explicit_block_id = variant.get("block_id")
        if explicit_block_id is not None and (not isinstance(explicit_block_id, str) or not explicit_block_id.strip()):
            raise ContentPackValidationError(
                f"{src}: block_schema.variants[{i}].block_id must be a non-empty string when provided"
            )
        block_id = explicit_block_id.strip() if isinstance(explicit_block_id, str) else f"{id_prefix}.{variant_key}"

        variant_tags = variant.get("tags", {})
        if variant_tags is None:
            variant_tags = {}
        if not isinstance(variant_tags, dict):
            raise ContentPackValidationError(f"{src}: block_schema.variants[{i}].tags must be an object")
        variant_descriptors = _normalize_descriptors_map(
            value=variant.get("descriptors"),
            field=f"block_schema.variants[{i}].descriptors",
        )

        text = variant.get("text")
        if text is not None and not isinstance(text, str):
            raise ContentPackValidationError(f"{src}: block_schema.variants[{i}].text must be a string")
        if text is None and text_template is not None:
            try:
                text = text_template.format(variant=variant_key)
            except Exception as exc:
                raise ContentPackValidationError(
                    f"{src}: block_schema.text_template failed for variant '{variant_key}': {exc}"
                ) from exc

        variant_op_id = variant.get("op_id")
        if variant_op_id is not None and (not isinstance(variant_op_id, str) or not variant_op_id.strip()):
            raise ContentPackValidationError(
                f"{src}: block_schema.variants[{i}].op_id must be a non-empty string"
            )
        variant_op_id_text = variant_op_id.strip() if isinstance(variant_op_id, str) else None

        variant_op_args_raw = variant.get("op_args")
        if variant_op_args_raw is None:
            variant_op_args: Dict[str, Any] = {}
        elif not isinstance(variant_op_args_raw, dict):
            raise ContentPackValidationError(
                f"{src}: block_schema.variants[{i}].op_args must be an object"
            )
        else:
            variant_op_args = {}
            for raw_key, raw_value in variant_op_args_raw.items():
                arg_key = str(raw_key).strip()
                if not arg_key:
                    raise ContentPackValidationError(
                        f"{src}: block_schema.variants[{i}].op_args keys must be non-empty strings"
                    )
                variant_op_args[arg_key] = raw_value

        variant_ref_bindings_raw = variant.get("ref_bindings")
        if variant_ref_bindings_raw is None:
            variant_ref_bindings: Dict[str, str] = {}
        elif not isinstance(variant_ref_bindings_raw, dict):
            raise ContentPackValidationError(
                f"{src}: block_schema.variants[{i}].ref_bindings must be an object"
            )
        else:
            variant_ref_bindings = {}
            for raw_key, raw_value in variant_ref_bindings_raw.items():
                ref_key = str(raw_key).strip()
                if not ref_key:
                    raise ContentPackValidationError(
                        f"{src}: block_schema.variants[{i}].ref_bindings keys must be non-empty strings"
                    )
                if not isinstance(raw_value, str) or not raw_value.strip():
                    raise ContentPackValidationError(
                        f"{src}: block_schema.variants[{i}].ref_bindings.{ref_key} must be a non-empty string"
                    )
                variant_ref_bindings[ref_key] = raw_value.strip()

        variant_op_modalities = _normalize_op_modalities(
            value=variant.get("op_modalities"),
            field=f"block_schema.variants[{i}].op_modalities",
        )

        reserved_variant_keys = {
            "key", "id", "block_id", "text", "tags",
            "op_id", "op_modalities", "op_args", "ref_bindings", "descriptors",
        }
        block = dict(base_block)
        for key, value in variant.items():
            if key in reserved_variant_keys:
                continue
            block[key] = value

        tags = dict(base_tags)
        tags.update(variant_tags)
        tags.setdefault("variant", variant_key)
        effective_descriptors = dict(base_descriptors)
        effective_descriptors.update(variant_descriptors)

        effective_op_id: str | None = variant_op_id_text
        if effective_op_id is None and schema_op is not None:
            template_id = schema_op.get("op_id_template")
            fixed_op_id = schema_op.get("op_id")
            if isinstance(template_id, str) and template_id:
                try:
                    effective_op_id = template_id.format(variant=variant_key)
                except Exception as exc:
                    raise ContentPackValidationError(
                        f"{src}: block_schema.op.op_id_template failed for variant '{variant_key}': {exc}"
                    ) from exc
            elif isinstance(fixed_op_id, str) and fixed_op_id:
                effective_op_id = fixed_op_id

        has_variant_op_fields = any(
            field in variant
            for field in ("op_id", "op_modalities", "op_args", "ref_bindings")
        )
        if effective_op_id is None and has_variant_op_fields:
            raise ContentPackValidationError(
                f"{src}: block_schema.variants[{i}] defines op fields but no op_id could be resolved"
            )

        has_text = isinstance(text, str) and bool(text.strip())
        has_op = isinstance(effective_op_id, str) and bool(effective_op_id.strip())
        if block_mode == "surface" and not has_text:
            raise ContentPackValidationError(
                f"{src}: block_schema.variants[{i}] mode=surface requires text or text_template output"
            )
        if block_mode == "hybrid":
            if not has_text:
                raise ContentPackValidationError(
                    f"{src}: block_schema.variants[{i}] mode=hybrid requires text or text_template output"
                )
            if not has_op:
                raise ContentPackValidationError(
                    f"{src}: block_schema.variants[{i}] mode=hybrid requires op_id resolution"
                )
        if block_mode == "op" and not has_op:
            raise ContentPackValidationError(
                f"{src}: block_schema.variants[{i}] mode=op requires op_id resolution"
            )
        # Compile-time renderability guard:
        # hybrid/op blocks should keep at least one human-inspectable surface.
        image_surface_tag = tags.get("image_surface")
        video_surface_tag = tags.get("video_surface")
        has_surface_hint = (
            (isinstance(image_surface_tag, str) and bool(image_surface_tag.strip()))
            or (isinstance(video_surface_tag, str) and bool(video_surface_tag.strip()))
        )
        if block_mode in {"hybrid", "op"} and not (has_text or has_surface_hint):
            raise ContentPackValidationError(
                f"{src}: block_schema.variants[{i}] mode={block_mode} requires text or image_surface/video_surface tags"
            )

        schema_modalities: List[str] = []
        if schema_op is not None:
            schema_modalities = list(schema_op.get("modalities") or [])

        effective_modalities = variant_op_modalities or schema_modalities

        schema_default_args: Dict[str, Any] = {}
        if schema_op is not None and isinstance(schema_op.get("default_args"), dict):
            schema_default_args = dict(schema_op.get("default_args") or {})
        effective_op_args = dict(schema_default_args)
        effective_op_args.update(variant_op_args)

        schema_refs: List[Dict[str, Any]] = []
        if schema_op is not None and isinstance(schema_op.get("refs"), list):
            schema_refs = [dict(item) for item in schema_op.get("refs") or [] if isinstance(item, dict)]

        schema_params: List[Dict[str, Any]] = []
        if schema_op is not None and isinstance(schema_op.get("params"), list):
            schema_params = [dict(item) for item in schema_op.get("params") or [] if isinstance(item, dict)]

        block_metadata = block.get("block_metadata")
        if block_metadata is None:
            normalized_metadata: Dict[str, Any] = {}
        elif not isinstance(block_metadata, dict):
            raise ContentPackValidationError(
                f"{src}: block_schema.variants[{i}].block_metadata must be an object"
            )
        else:
            normalized_metadata = dict(block_metadata)
        normalized_metadata.setdefault("mode", block_mode)
        existing_descriptors = normalized_metadata.get("descriptors")
        if existing_descriptors is not None and not isinstance(existing_descriptors, dict):
            raise ContentPackValidationError(
                f"{src}: block_schema.variants[{i}].block_metadata.descriptors must be an object"
            )
        merged_descriptors: Dict[str, Any] = {}
        if isinstance(existing_descriptors, dict):
            merged_descriptors.update(existing_descriptors)
        merged_descriptors.update(effective_descriptors)
        if merged_descriptors:
            normalized_metadata["descriptors"] = merged_descriptors

        if effective_op_id is not None:
            op_payload: Dict[str, Any] = {"op_id": effective_op_id}
            if schema_op is not None and isinstance(schema_op.get("signature_id"), str):
                op_payload["signature_id"] = str(schema_op.get("signature_id"))
            if effective_modalities:
                op_payload["modalities"] = effective_modalities
            if schema_refs:
                op_payload["refs"] = schema_refs
            if schema_params:
                op_payload["params"] = schema_params
            if effective_op_args:
                op_payload["args"] = effective_op_args
            if variant_ref_bindings:
                op_payload["ref_bindings"] = variant_ref_bindings

            normalized_metadata["op"] = op_payload

            tags.setdefault("op_id", effective_op_id)
            op_namespace = effective_op_id.split(".", 1)[0].strip()
            if op_namespace:
                tags.setdefault("op_namespace", op_namespace)
            if effective_modalities:
                tags.setdefault("op_modalities", ",".join(effective_modalities))
                modality_support_tag = _derive_modality_support_tag(effective_modalities)
                if modality_support_tag:
                    tags.setdefault("modality_support", modality_support_tag)

            op_capabilities = [f"op:{effective_op_id}"]
            ref_capabilities: List[str] = []
            for ref in schema_refs:
                capability = ref.get("capability")
                if isinstance(capability, str) and capability.strip():
                    ref_cap = capability.strip()
                    ref_capabilities.append(ref_cap)
                    op_capabilities.append(f"ref:{ref_cap}")
            if ref_capabilities:
                tags.setdefault("op_ref_capabilities", ",".join(ref_capabilities))
            existing_caps = normalize_capability_ids(block.get("capabilities"))
            block["capabilities"] = normalize_capability_ids(existing_caps + op_capabilities)

        block["block_id"] = block_id
        block["tags"] = tags
        tags.setdefault("block_mode", block_mode)
        block["block_metadata"] = normalized_metadata
        if text is not None:
            block["text"] = text

        compiled.append(block)

    return compiled


# ── Manifest query field type sets ──────────────────────────────────────────
_MANIFEST_QUERY_STRING_FIELDS: frozenset[str] = frozenset({
    "role", "composition_role", "category", "package_name", "tags",
    "expected_row_values", "expected_col_values",
    "expected_tag_keys", "required_tag_keys",
})
_MANIFEST_QUERY_BOOL_FIELDS: frozenset[str] = frozenset({"include_empty", "include_drift_report"})
_MANIFEST_QUERY_INT_FIELDS: frozenset[str] = frozenset({"limit"})


def _normalize_manifest_query(
    *,
    query: Dict[str, Any],
    src: Path,
    preset_index: int,
) -> Dict[str, Any]:
    """Validate types and normalize a manifest query object.

    Known string fields are type-checked and trimmed.  Bool and int fields are
    type-checked.  Unknown fields are preserved as-is for forward compatibility.
    ``row_key`` and ``col_key`` must already be validated as non-empty strings.
    """
    normalized = dict(query)
    # Trim the required axis keys (already validated as non-empty strings).
    normalized["row_key"] = str(normalized["row_key"]).strip()
    normalized["col_key"] = str(normalized["col_key"]).strip()

    for field in _MANIFEST_QUERY_STRING_FIELDS:
        value = normalized.get(field)
        if value is None:
            continue
        if not isinstance(value, str):
            raise ContentPackValidationError(
                f"{src}: matrix_presets[{preset_index}].query.{field} must be a string"
            )
        normalized[field] = value.strip()

    for field in _MANIFEST_QUERY_BOOL_FIELDS:
        value = normalized.get(field)
        if value is None:
            continue
        if not isinstance(value, bool):
            raise ContentPackValidationError(
                f"{src}: matrix_presets[{preset_index}].query.{field} must be a boolean"
            )

    for field in _MANIFEST_QUERY_INT_FIELDS:
        value = normalized.get(field)
        if value is None:
            continue
        # bool is a subclass of int in Python — reject it explicitly.
        if isinstance(value, bool) or not isinstance(value, int):
            raise ContentPackValidationError(
                f"{src}: matrix_presets[{preset_index}].query.{field} must be an integer"
            )

    # Canonicalize legacy role filter key.
    if (
        isinstance(normalized.get("role"), str)
        and normalized.get("role")
        and not isinstance(normalized.get("composition_role"), str)
    ):
        normalized["composition_role"] = normalized["role"]

    return normalized


def _validate_manifest_query_registry(
    *,
    query: Dict[str, Any],
    src: Path,
    preset_index: int,
    family_schemas: Dict[str, Any],
    known_tag_keys: frozenset[str],
) -> None:
    """Registry-aware validation for manifest query fields.

    Validates ``sequence_family`` values found in the compact ``tags`` filter
    string against registered prompt block families, and validates
    ``tag:<key>`` references in ``row_key``/``col_key`` against canonical
    prompt block tag keys.

    Individual checks are silently skipped when the corresponding registry
    data is unavailable (empty collections) so the loader degrades gracefully
    in environments where the registry is not fully populated.
    """
    # Validate sequence_family values in the compact "key:value,..." tags string.
    tags_str = query.get("tags")
    if isinstance(tags_str, str) and family_schemas:
        for part in tags_str.split(","):
            part = part.strip()
            kv = part.split(":", 1)
            if len(kv) == 2 and kv[0].strip() == "sequence_family":
                family_id = kv[1].strip()
                if family_id and family_id not in family_schemas:
                    known = ", ".join(sorted(family_schemas.keys()))
                    raise ContentPackValidationError(
                        f"{src}: matrix_presets[{preset_index}].query.tags references "
                        f"unknown sequence_family '{family_id}'"
                        + (f" (known: {known})" if known else "")
                    )

    # Validate tag key references in row_key and col_key.
    if known_tag_keys:
        for field in ("row_key", "col_key"):
            value = query.get(field, "")
            if isinstance(value, str) and value.startswith("tag:"):
                tag_key = value[4:].strip()
                if tag_key and tag_key not in known_tag_keys:
                    raise ContentPackValidationError(
                        f"{src}: matrix_presets[{preset_index}].query.{field} references "
                        f"unknown tag key '{tag_key}' (not registered in prompt_block_tags)"
                    )


def _parse_compact_tags(tags_str: str) -> Dict[str, str]:
    """Parse a compact ``key:value,...`` tags string into a dict.

    Only the first ``key:value`` pair per key is kept.  Values that do not
    contain a colon are silently ignored (they are not valid key:value pairs).
    """
    result: Dict[str, str] = {}
    for part in tags_str.split(","):
        part = part.strip()
        kv = part.split(":", 1)
        if len(kv) == 2:
            k, v = kv[0].strip(), kv[1].strip()
            if k and k not in result:
                result[k] = v
    return result


def _validate_manifest_query_family_axes(
    *,
    query: Dict[str, Any],
    src: Path,
    preset_index: int,
    family_schemas: Dict[str, Any],
) -> None:
    """Validate axis and expected-value consistency against family contracts.

    When a manifest query's ``tags`` string pins both ``sequence_family`` and
    the family's axis tag key (typically ``beat_axis``) to a single value:

    1. Confirms the axis value is registered in the family schema.
    2. For each of ``expected_row_values`` / ``expected_col_values``:
       if the corresponding ``row_key`` / ``col_key`` is ``tag:<key>`` *and*
       the family+axis schema declares ``expected_values`` for that tag key,
       validates every CSV token against the allowed set.

    Silently skips when:
    - ``family_schemas`` is empty (registry unavailable)
    - ``tags`` does not pin exactly one family + axis
    - The family schema has no ``expected_values`` for the referenced tag key
    """
    if not family_schemas:
        return

    tags_str = query.get("tags")
    if not isinstance(tags_str, str):
        return

    tag_pairs = _parse_compact_tags(tags_str)
    family_id = tag_pairs.get("sequence_family")
    if not family_id:
        return

    family_schema = family_schemas.get(family_id)
    if not isinstance(family_schema, dict):
        return  # already caught by sequence_family validation

    axis_tag_key = str(family_schema.get("axis_tag_key") or "beat_axis")
    axis_id = tag_pairs.get(axis_tag_key)
    if not axis_id:
        return  # no axis pinned — nothing to validate here

    axes = family_schema.get("axes") or {}
    if not isinstance(axes, dict):
        return

    if axis_id not in axes:
        valid_axes = ", ".join(sorted(str(k) for k in axes.keys()))
        raise ContentPackValidationError(
            f"{src}: matrix_presets[{preset_index}].query.tags references "
            f"unknown axis '{axis_id}' for family '{family_id}'"
            + (f" (valid: {valid_axes})" if valid_axes else "")
        )

    axis_schema = axes.get(axis_id) or {}
    expected_values_map = axis_schema.get("expected_values") or {}
    if not isinstance(expected_values_map, dict) or not expected_values_map:
        return

    # Check expected_row_values / expected_col_values against the family contract.
    for axis_field, ev_field in (
        ("row_key", "expected_row_values"),
        ("col_key", "expected_col_values"),
    ):
        key_ref = query.get(axis_field, "")
        ev_csv = query.get(ev_field)
        if not isinstance(key_ref, str) or not isinstance(ev_csv, str):
            continue
        if not key_ref.startswith("tag:"):
            continue
        tag_key = key_ref[4:].strip()
        if not tag_key or tag_key not in expected_values_map:
            continue
        allowed_raw = expected_values_map[tag_key]
        allowed = {str(v) for v in (allowed_raw if isinstance(allowed_raw, list) else [allowed_raw])}
        for val in ev_csv.split(","):
            val = val.strip()
            if val and val not in allowed:
                allowed_display = ", ".join(sorted(allowed))
                raise ContentPackValidationError(
                    f"{src}: matrix_presets[{preset_index}].query.{ev_field} value '{val}' "
                    f"is not valid for family '{family_id}' axis '{axis_id}' "
                    f"tag '{tag_key}' (expected one of: {allowed_display})"
                )


def _iter_pack_manifest_sources(content_dir: Path) -> List[Path]:
    """Return manifest.yaml/yml sources within a content pack.

    Convention:
    - <pack>/manifest.(yaml|yml) (pack-level)
    - <pack>/blocks/**/manifest.(yaml|yml) (group/folder-level)
    - <pack>/templates/**/manifest.(yaml|yml) (optional; template-grouping)
    """
    sources: List[Path] = []
    for suffix in _YAML_SUFFIXES:
        root = content_dir / f"manifest{suffix}"
        if root.exists() and root.is_file():
            sources.append(root)

    for section in ("blocks", "templates"):
        base = content_dir / section
        if not base.exists() or not base.is_dir():
            continue
        for suffix in _YAML_SUFFIXES:
            sources.extend(p for p in base.rglob(f"*{suffix}") if p.is_file() and p.stem == "manifest")

    # Stable output.
    return sorted(set(sources))


def parse_manifests(content_dir: Path, *, pack_name: str) -> List[Dict[str, Any]]:
    """Parse optional manifest YAML sources for matrix-query presets.

    These manifests are *non-authoritative helpers* for tools/agents/UI to offer
    ready-made Block Matrix queries without hardcoding them in code.

    Supported schema (top-level):
      - id: str?            (optional; must be unique across all manifests in the pack)
      - title: str?         (optional)
      - description: str?   (optional)
      - matrix_presets: []  (required for a valid manifest file)
          - label: str      (required; must be unique within this manifest file)
          - query: object   (required)
              - row_key: str               (required, non-empty)
              - col_key: str               (required, non-empty)
              - composition_role: str?     (preferred inferred-role filter)
              - role: str?                 (deprecated alias)
              - category: str?
              - package_name: str?
              - tags: str?                 (compact "key:value,..." filter)
              - include_empty: bool?
              - include_drift_report: bool?
              - expected_row_values: str?
              - expected_col_values: str?
              - expected_tag_keys: str?
              - required_tag_keys: str?
              - limit: int?
    """
    sources = _iter_pack_manifest_sources(content_dir)
    if not sources:
        return []

    # Load registry data once for the whole pack so per-file loops stay cheap.
    family_schemas = load_prompt_block_family_schemas()
    known_tag_keys = load_prompt_block_tag_keys()

    manifests: List[Dict[str, Any]] = []
    seen_manifest_ids: Dict[str, Path] = {}

    for src in sources:
        data = _load_yaml(src)
        if not isinstance(data, dict):
            raise ContentPackValidationError(f"{src}: manifest must be an object")

        matrix_presets = data.get("matrix_presets")
        if matrix_presets is None:
            continue
        if not isinstance(matrix_presets, list):
            raise ContentPackValidationError(f"{src}: matrix_presets must be a list")

        parsed_presets: List[Dict[str, Any]] = []
        seen_preset_labels: Dict[str, int] = {}

        for i, raw in enumerate(matrix_presets):
            if not isinstance(raw, dict):
                raise ContentPackValidationError(f"{src}: matrix_presets[{i}] must be an object")

            label = _required_non_empty_string(
                value=raw.get("label"),
                path=src,
                section="matrix_presets",
                index=i,
                field="label",
            )
            if label in seen_preset_labels:
                raise ContentPackValidationError(
                    f"{src}: matrix_presets[{i}].label '{label}' duplicates "
                    f"matrix_presets[{seen_preset_labels[label]}].label"
                )
            seen_preset_labels[label] = i

            query = raw.get("query")
            if not isinstance(query, dict):
                raise ContentPackValidationError(f"{src}: matrix_presets[{i}].query must be an object")

            row_key = query.get("row_key")
            col_key = query.get("col_key")
            if not isinstance(row_key, str) or not row_key.strip():
                raise ContentPackValidationError(
                    f"{src}: matrix_presets[{i}].query.row_key must be a non-empty string"
                )
            if not isinstance(col_key, str) or not col_key.strip():
                raise ContentPackValidationError(
                    f"{src}: matrix_presets[{i}].query.col_key must be a non-empty string"
                )

            normalized_query = _normalize_manifest_query(query=query, src=src, preset_index=i)
            _validate_manifest_query_registry(
                query=normalized_query,
                src=src,
                preset_index=i,
                family_schemas=family_schemas,
                known_tag_keys=known_tag_keys,
            )
            _validate_manifest_query_family_axes(
                query=normalized_query,
                src=src,
                preset_index=i,
                family_schemas=family_schemas,
            )
            parsed_presets.append({"label": label, "query": normalized_query})

        manifest_id = _ensure_optional_string(value=data.get("id"), path=src, field="id")
        if manifest_id is not None:
            if manifest_id in seen_manifest_ids:
                raise ContentPackValidationError(
                    f"{src}: manifest id '{manifest_id}' already defined in {seen_manifest_ids[manifest_id]}"
                )
            seen_manifest_ids[manifest_id] = src

        manifests.append(
            {
                "pack_name": pack_name,
                "source": str(src.relative_to(content_dir).as_posix()),
                "id": manifest_id,
                "title": _ensure_optional_string(value=data.get("title"), path=src, field="title"),
                "description": _ensure_optional_string(value=data.get("description"), path=src, field="description"),
                "matrix_presets": parsed_presets,
            }
        )

    return manifests


def parse_templates(content_dir: Path) -> List[Dict[str, Any]]:
    """Parse templates YAML sources, normalising slot indices."""
    sources = _iter_pack_sources(content_dir, "templates")
    if not sources:
        return []

    templates: List[Dict[str, Any]] = []
    seen_slugs: Dict[str, Path] = {}
    family_schemas = load_prompt_block_family_schemas()

    for src in sources:
        data = _load_yaml(src)
        raw_templates = data.get("templates", [])
        if raw_templates is None:
            raw_templates = []
        if not isinstance(raw_templates, list):
            raise ContentPackValidationError(f"{src}: templates must be a list")

        for index, raw in enumerate(raw_templates):
            if not isinstance(raw, dict):
                raise ContentPackValidationError(
                    f"{src}: templates[{index}] must be an object"
                )

            slug = _required_non_empty_string(
                value=raw.get("slug"),
                path=src,
                section="templates",
                index=index,
                field="slug",
            )
            if slug in seen_slugs:
                raise ContentPackValidationError(
                    f"{src}: duplicate slug '{slug}' in templates[{index}] (already defined in {seen_slugs[slug]})"
                )
            seen_slugs[slug] = src
            raw["slug"] = slug

            for field_name in ("name", "description", "composition_strategy", "package_name"):
                value = raw.get(field_name)
                if value is not None and not isinstance(value, str):
                    raise ContentPackValidationError(
                        f"{src}: templates[{index}].{field_name} must be a string"
                    )

            slots = _ensure_optional_list(
                value=raw.get("slots"),
                path=src,
                section="templates",
                index=index,
                field="slots",
            )
            raw_metadata = _ensure_optional_dict(
                value=raw.get("template_metadata"),
                path=src,
                section="templates",
                index=index,
                field="template_metadata",
            )
            try:
                slots, raw_metadata = expand_template_feature_presets(
                    raw_slots=slots,
                    template_metadata=raw_metadata,
                )
            except ValueError as exc:
                raise ContentPackValidationError(
                    f"{src}: templates[{index}].template_metadata.features invalid: {exc}"
                ) from exc
            slot_schema_version = raw_metadata.get("slot_schema_version")
            raw_controls = raw_metadata.get("controls")
            if isinstance(raw_controls, list):
                try:
                    raw_metadata["controls"] = expand_control_presets(raw_controls)
                except ValueError as exc:
                    raise ContentPackValidationError(
                        f"{src}: templates[{index}].template_metadata.controls invalid: {exc}"
                    ) from exc
            try:
                raw["slots"] = normalize_template_slots(slots, schema_version=slot_schema_version)
            except ValueError as exc:
                raise ContentPackValidationError(
                    f"{src}: templates[{index}].slots invalid: {exc}"
                ) from exc
            try:
                validate_template_slots_family_contracts(
                    slots=raw["slots"],
                    path=src,
                    template_index=index,
                    template_slug=slug,
                    family_schemas=family_schemas,
                )
            except BlockFamilyContractValidationError as exc:
                raise ContentPackValidationError(str(exc)) from exc

            metadata = raw_metadata
            metadata["slot_schema_version"] = TEMPLATE_SLOT_SCHEMA_VERSION
            metadata[CONTENT_PACK_SOURCE_KEY] = content_dir.name
            raw["template_metadata"] = metadata
            templates.append(raw)

    return templates


def parse_characters(content_dir: Path) -> List[Dict[str, Any]]:
    """Parse character YAML sources."""
    sources = _iter_pack_sources(content_dir, "characters")
    if not sources:
        return []

    characters: List[Dict[str, Any]] = []
    seen_character_ids: Dict[str, Path] = {}

    for src in sources:
        data = _load_yaml(src)
        raw_characters = data.get("characters", [])
        if raw_characters is None:
            raw_characters = []
        if not isinstance(raw_characters, list):
            raise ContentPackValidationError(f"{src}: characters must be a list")

        for index, raw in enumerate(raw_characters):
            if not isinstance(raw, dict):
                raise ContentPackValidationError(
                    f"{src}: characters[{index}] must be an object"
                )

            character_id = _required_non_empty_string(
                value=raw.get("character_id"),
                path=src,
                section="characters",
                index=index,
                field="character_id",
            )
            if character_id in seen_character_ids:
                raise ContentPackValidationError(
                    f"{src}: duplicate character_id '{character_id}' in characters[{index}] (already defined in {seen_character_ids[character_id]})"
                )
            seen_character_ids[character_id] = src
            raw["character_id"] = character_id

            metadata = _ensure_optional_dict(
                value=raw.get("character_metadata"),
                path=src,
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


def _project_block_to_primitive(block: Dict[str, Any], *, plugin_name: str) -> Dict[str, Any]:
    """Project a legacy content-pack block shape into BlockPrimitive fields."""
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
    else:
        legacy_category = None

    package_name = block.get("package_name")
    if isinstance(package_name, str) and package_name.strip():
        tags.setdefault("source_pack", package_name.strip())
    else:
        tags.setdefault("source_pack", plugin_name)

    tags[CONTENT_PACK_SOURCE_KEY] = plugin_name

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

    return {
        "block_id": block.get("block_id"),
        "category": category,
        "text": text,
        "tags": tags,
        "capabilities": capabilities,
        "source": source,
        "is_public": is_public,
    }


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
    allow_rehome: bool = True,
) -> Dict[str, int]:
    """Upsert a list of YAML-parsed dicts into the given model.

    Args:
        model_cls: SQLModel class (BlockPrimitive, BlockTemplate, Character).
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
                if not allow_rehome:
                    raise ContentPackValidationError(
                        f"Pack '{pack_name}': {model_cls.__name__} '{lookup_value}' "
                        f"already belongs to content pack '{existing_source}'. "
                        "Use namespaced block_id values (for example "
                        f"'{incoming_source}.<name>') to avoid collisions."
                    )
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

    Blocks are written to the blocks database (BlockPrimitive). Templates and
    characters continue to use the main application database.
    """
    from pixsim7.backend.main.domain.prompt import BlockTemplate
    from pixsim7.backend.main.domain.game.entities.character import Character

    content_dir = CONTENT_PACKS_DIR / plugin_name
    if not content_dir.exists():
        raise FileNotFoundError(f"Content pack not found: {content_dir}")

    now = datetime.now(timezone.utc)
    combined: Dict[str, int] = {}

    parsed_blocks = parse_blocks(content_dir)
    primitive_items = [
        _project_block_to_primitive(item, plugin_name=plugin_name)
        for item in parsed_blocks
    ]
    parsed_templates = parse_templates(content_dir)
    parsed_characters = parse_characters(content_dir)

    async with get_async_blocks_session() as blocks_db:
        s = await _upsert_entities(
            blocks_db,
            BlockPrimitive,
            primitive_items,
            lookup_field="block_id",
            fields=_BLOCK_FIELDS,
            create_only=_BLOCK_CREATE_ONLY,
            force=force,
            metadata_field="tags",
            now=now,
            pack_name=plugin_name,
            allow_rehome=False,
        )
        combined["blocks_created"] = s["created"]
        combined["blocks_updated"] = s["updated"]
        combined["blocks_skipped"] = s["skipped"]
        combined["blocks_pruned"] = 0

        if prune_missing:
            combined["blocks_pruned"] = await _prune_missing_entities(
                blocks_db,
                BlockPrimitive,
                lookup_field="block_id",
                metadata_field="tags",
                source_pack_name=plugin_name,
                incoming_lookup_values=[item["block_id"] for item in primitive_items],
            )

        await blocks_db.commit()

    for prefix, model, items, fields, create_only, lookup, metadata_field in [
        ("templates", BlockTemplate, parsed_templates,
         _TEMPLATE_FIELDS, _TEMPLATE_CREATE_ONLY, "slug", "template_metadata"),
        ("characters", Character, parsed_characters,
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


async def get_content_pack_inventory(db: AsyncSession) -> Dict[str, Any]:
    """Build an inventory of content packs across DB and disk.

    Returns a dict with:
      - disk_packs: list of pack names found on disk
      - packs: {name: {status, blocks, templates, characters}}
      - summary: {orphaned_packs, total_orphaned_entities, ...}
    """
    from pixsim7.backend.main.domain.prompt import BlockTemplate
    from pixsim7.backend.main.domain.game.entities.character import Character

    disk_packs = set(discover_content_packs())

    # Query distinct content_pack values + counts from each entity type
    db_packs: Dict[str, Dict[str, int]] = {}  # pack -> {blocks, templates, characters}

    # BlockPrimitive lives in the blocks DB
    async with get_async_blocks_session() as blocks_db:
        result = await blocks_db.execute(
            select(
                BlockPrimitive.tags.op("->>")(CONTENT_PACK_SOURCE_KEY).label("pack"),
                func.count().label("cnt"),
            )
            .where(BlockPrimitive.tags.op("->>")(CONTENT_PACK_SOURCE_KEY).isnot(None))
            .group_by("pack")
        )
        for row in result.all():
            pack_name = row.pack
            if pack_name:
                db_packs.setdefault(pack_name, {"blocks": 0, "templates": 0, "characters": 0})
                db_packs[pack_name]["blocks"] = row.cnt

    # BlockTemplate in main DB
    result = await db.execute(
        select(
            BlockTemplate.template_metadata.op("->>")(CONTENT_PACK_SOURCE_KEY).label("pack"),
            func.count().label("cnt"),
        )
        .where(BlockTemplate.template_metadata.op("->>")(CONTENT_PACK_SOURCE_KEY).isnot(None))
        .group_by("pack")
    )
    for row in result.all():
        pack_name = row.pack
        if pack_name:
            db_packs.setdefault(pack_name, {"blocks": 0, "templates": 0, "characters": 0})
            db_packs[pack_name]["templates"] = row.cnt

    # Character in main DB
    result = await db.execute(
        select(
            Character.character_metadata.op("->>")(CONTENT_PACK_SOURCE_KEY).label("pack"),
            func.count().label("cnt"),
        )
        .where(Character.character_metadata.op("->>")(CONTENT_PACK_SOURCE_KEY).isnot(None))
        .group_by("pack")
    )
    for row in result.all():
        pack_name = row.pack
        if pack_name:
            db_packs.setdefault(pack_name, {"blocks": 0, "templates": 0, "characters": 0})
            db_packs[pack_name]["characters"] = row.cnt

    # Merge disk + DB pack names
    all_pack_names = sorted(disk_packs | set(db_packs.keys()))

    packs: Dict[str, Dict[str, Any]] = {}
    orphaned_packs = 0
    total_orphaned_entities = 0

    for name in all_pack_names:
        in_db = name in db_packs
        on_disk = name in disk_packs
        counts = db_packs.get(name, {"blocks": 0, "templates": 0, "characters": 0})

        if on_disk and in_db:
            status = "active"
        elif in_db and not on_disk:
            status = "orphaned"
            orphaned_packs += 1
            total_orphaned_entities += counts["blocks"] + counts["templates"] + counts["characters"]
        else:
            status = "disk_only"

        packs[name] = {"status": status, **counts}

    return {
        "disk_packs": sorted(disk_packs),
        "packs": packs,
        "summary": {
            "total_packs": len(all_pack_names),
            "active_packs": sum(1 for p in packs.values() if p["status"] == "active"),
            "orphaned_packs": orphaned_packs,
            "disk_only_packs": sum(1 for p in packs.values() if p["status"] == "disk_only"),
            "total_orphaned_entities": total_orphaned_entities,
        },
    }


async def purge_orphaned_pack(db: AsyncSession, pack_name: str) -> Dict[str, int]:
    """Delete all entities belonging to a content pack no longer on disk.

    Safety: refuses if the pack still exists on disk.
    Returns {blocks_purged, templates_purged, characters_purged}.
    """
    from pixsim7.backend.main.domain.prompt import BlockTemplate
    from pixsim7.backend.main.domain.game.entities.character import Character

    if pack_name in discover_content_packs():
        raise ValueError(
            f"Pack '{pack_name}' still exists on disk. "
            "Archive or remove it before purging."
        )

    result: Dict[str, int] = {
        "blocks_purged": 0,
        "templates_purged": 0,
        "characters_purged": 0,
    }

    # Purge BlockPrimitive from blocks DB
    async with get_async_blocks_session() as blocks_db:
        result["blocks_purged"] = await _prune_missing_entities(
            blocks_db,
            BlockPrimitive,
            lookup_field="block_id",
            metadata_field="tags",
            source_pack_name=pack_name,
            incoming_lookup_values=[],
        )
        await blocks_db.commit()

    # Purge BlockTemplate from main DB
    result["templates_purged"] = await _prune_missing_entities(
        db,
        BlockTemplate,
        lookup_field="slug",
        metadata_field="template_metadata",
        source_pack_name=pack_name,
        incoming_lookup_values=[],
    )

    # Purge Character from main DB
    result["characters_purged"] = await _prune_missing_entities(
        db,
        Character,
        lookup_field="character_id",
        metadata_field="character_metadata",
        source_pack_name=pack_name,
        incoming_lookup_values=[],
    )

    await db.commit()

    logger.info(
        "content_pack_purged",
        pack=pack_name,
        **{k: v for k, v in result.items() if v},
    )

    return result
