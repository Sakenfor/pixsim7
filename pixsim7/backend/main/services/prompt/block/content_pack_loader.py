"""
Content-pack loader - discovers and loads blocks, templates, and characters
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
    normalize_capability_ids,
)
from pixsim7.backend.main.services.prompt.block.content_pack_manifests import (
    MANIFEST_QUERY_BOOL_FIELDS,
    MANIFEST_QUERY_INT_FIELDS,
    MANIFEST_QUERY_STRING_FIELDS,
    ManifestValidationError,
    iter_pack_manifest_sources as _iter_pack_manifest_sources_impl,
    normalize_manifest_query as _normalize_manifest_query_impl,
    parse_manifests as _parse_manifests_impl,
    validate_manifest_query_family_axes as _validate_manifest_query_family_axes_impl,
    validate_manifest_query_registry as _validate_manifest_query_registry_impl,
)
from pixsim7.backend.main.services.prompt.block.content_pack_projection import (
    project_block_to_primitive as _project_block_to_primitive_impl,
)
from pixsim7.backend.main.services.prompt.block.content_pack_schema_compiler import (
    SchemaCompilerValidationError,
    _compile_schema_blocks as _compile_schema_blocks_impl,
    _derive_variant_tags_from_op_args as _derive_variant_tags_from_op_args_impl,
    _normalize_tag_value_with_aliases as _normalize_tag_value_with_aliases_impl,
)
from pixsim7.backend.main.services.prompt.block.template_slots import (
    TEMPLATE_SLOT_SCHEMA_VERSION,
    normalize_template_slots,
)
from pixsim7.backend.main.services.prompt.block.family_contract_validation import (
    BlockFamilyContractValidationError,
    load_prompt_block_family_schemas,
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


# -- Field specs for each entity type --
# {field_name: default} - used for both create and update.
# "create_only" fields are only set on INSERT, never overwritten on UPDATE.

_BLOCK_FIELDS: Dict[str, Any] = {
    "category": "uncategorized",
    "text": "",
    "tags": {},
    "block_metadata": {},
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


# -- YAML parsing --

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


def _normalize_tag_value_with_aliases(
    *,
    tag_key: str,
    value: Any,
    value_alias_map: Dict[str, Dict[str, str]],
) -> Any:
    return _normalize_tag_value_with_aliases_impl(
        tag_key=tag_key,
        value=value,
        value_alias_map=value_alias_map,
    )


def _derive_variant_tags_from_op_args(
    *,
    schema_params: List[Dict[str, Any]],
    effective_op_args: Dict[str, Any],
    src: Path,
    variant_index: int,
    known_tag_keys: frozenset[str],
    value_alias_map: Dict[str, Dict[str, str]],
) -> Dict[str, Any]:
    try:
        return _derive_variant_tags_from_op_args_impl(
            schema_params=schema_params,
            effective_op_args=effective_op_args,
            src=src,
            variant_index=variant_index,
            known_tag_keys=known_tag_keys,
            value_alias_map=value_alias_map,
        )
    except SchemaCompilerValidationError as exc:
        raise ContentPackValidationError(str(exc)) from exc


def _compile_schema_blocks(*, block_schema: Any, src: Path) -> List[Dict[str, Any]]:
    try:
        return _compile_schema_blocks_impl(block_schema=block_schema, src=src)
    except SchemaCompilerValidationError as exc:
        raise ContentPackValidationError(str(exc)) from exc

# -- Manifest query field type sets --
_MANIFEST_QUERY_STRING_FIELDS = MANIFEST_QUERY_STRING_FIELDS
_MANIFEST_QUERY_BOOL_FIELDS = MANIFEST_QUERY_BOOL_FIELDS
_MANIFEST_QUERY_INT_FIELDS = MANIFEST_QUERY_INT_FIELDS


def _normalize_manifest_query(
    *,
    query: Dict[str, Any],
    src: Path,
    preset_index: int,
) -> Dict[str, Any]:
    try:
        return _normalize_manifest_query_impl(query=query, src=src, preset_index=preset_index)
    except ManifestValidationError as exc:
        raise ContentPackValidationError(str(exc)) from exc


def _validate_manifest_query_registry(
    *,
    query: Dict[str, Any],
    src: Path,
    preset_index: int,
    family_schemas: Dict[str, Any],
    known_tag_keys: frozenset[str],
) -> None:
    try:
        return _validate_manifest_query_registry_impl(
            query=query,
            src=src,
            preset_index=preset_index,
            family_schemas=family_schemas,
            known_tag_keys=known_tag_keys,
        )
    except ManifestValidationError as exc:
        raise ContentPackValidationError(str(exc)) from exc


def _validate_manifest_query_family_axes(
    *,
    query: Dict[str, Any],
    src: Path,
    preset_index: int,
    family_schemas: Dict[str, Any],
) -> None:
    try:
        return _validate_manifest_query_family_axes_impl(
            query=query,
            src=src,
            preset_index=preset_index,
            family_schemas=family_schemas,
        )
    except ManifestValidationError as exc:
        raise ContentPackValidationError(str(exc)) from exc


def _iter_pack_manifest_sources(content_dir: Path) -> List[Path]:
    return _iter_pack_manifest_sources_impl(content_dir)


def parse_manifests(content_dir: Path, *, pack_name: str) -> List[Dict[str, Any]]:
    try:
        return _parse_manifests_impl(content_dir, pack_name=pack_name)
    except ManifestValidationError as exc:
        raise ContentPackValidationError(str(exc)) from exc


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


# -- Generic upsert --

def _pick(data: Dict[str, Any], field_defaults: Dict[str, Any]) -> Dict[str, Any]:
    """Extract fields from data, falling back to defaults for missing keys."""
    return {k: data.get(k, default) for k, default in field_defaults.items()}


def _project_block_to_primitive(block: Dict[str, Any], *, plugin_name: str) -> Dict[str, Any]:
    return _project_block_to_primitive_impl(
        block,
        plugin_name=plugin_name,
        content_pack_source_key=CONTENT_PACK_SOURCE_KEY,
    )


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

    prepared_items: List[tuple[Any, Dict[str, Any], Dict[str, Any]]] = []
    lookup_values: List[Any] = []
    for item in items:
        lookup_value = item.get(lookup_field)
        if lookup_value is None:
            raise ContentPackValidationError(
                f"Pack '{pack_name}': item missing required lookup field '{lookup_field}'"
            )
        attrs = _pick(item, fields)
        prepared_items.append((lookup_value, attrs, item))
        lookup_values.append(lookup_value)

    existing_rows: Dict[Any, Any] = {}
    if lookup_values:
        unique_lookup_values = list(dict.fromkeys(lookup_values))
        chunk_size = 1000
        for start in range(0, len(unique_lookup_values), chunk_size):
            chunk = unique_lookup_values[start:start + chunk_size]
            result = await db.execute(select(model_cls).where(column.in_(chunk)))
            for row in result.scalars().all():
                existing_rows[getattr(row, lookup_field)] = row

    for lookup_value, attrs, item in prepared_items:
        row = existing_rows.get(lookup_value)

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
            existing_rows[lookup_value] = entity
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


# -- Public API --

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


def _rewrite_pack_metadata(
    metadata: Dict[str, Any] | None,
    *,
    source_pack_name: str,
    target_pack_name: str,
) -> tuple[Dict[str, Any], bool]:
    """Rewrite `content_pack` and nested source.pack metadata values."""
    current = dict(metadata or {})
    changed = False

    if current.get(CONTENT_PACK_SOURCE_KEY) == source_pack_name:
        current[CONTENT_PACK_SOURCE_KEY] = target_pack_name
        changed = True

    source_meta = current.get("source")
    if isinstance(source_meta, dict):
        next_source_meta = dict(source_meta)
        if next_source_meta.get("pack") == source_pack_name:
            next_source_meta["pack"] = target_pack_name
            current["source"] = next_source_meta
            changed = True

    return current, changed


async def adopt_orphaned_pack(
    db: AsyncSession,
    source_pack_name: str,
    target_pack_name: str,
    *,
    rewrite_package_names: bool = True,
) -> Dict[str, int]:
    """Rehome orphaned pack entities by rewriting metadata source-pack references."""
    from pixsim7.backend.main.domain.prompt import BlockTemplate
    from pixsim7.backend.main.domain.game.entities.character import Character

    source_pack_name = source_pack_name.strip()
    target_pack_name = target_pack_name.strip()

    if not source_pack_name:
        raise ValueError("source_pack_name is required")
    if not target_pack_name:
        raise ValueError("target_pack_name is required")
    if source_pack_name == target_pack_name:
        raise ValueError("source and target pack names must differ")

    disk_packs = set(discover_content_packs())
    if target_pack_name not in disk_packs:
        raise ValueError(
            f"Target pack '{target_pack_name}' does not exist on disk."
        )

    inventory = await get_content_pack_inventory(db)
    source_info = inventory.get("packs", {}).get(source_pack_name)
    if source_info is None:
        raise ValueError(f"Source pack '{source_pack_name}' not found in inventory.")
    if source_info.get("status") != "orphaned":
        raise ValueError(
            f"Source pack '{source_pack_name}' is not orphaned (status={source_info.get('status')})."
        )

    now = datetime.now(timezone.utc)
    result: Dict[str, int] = {
        "blocks_adopted": 0,
        "templates_adopted": 0,
        "characters_adopted": 0,
        "template_package_renamed": 0,
        "slot_package_renamed": 0,
        "block_source_pack_renamed": 0,
    }

    # BlockPrimitive lives in the blocks DB.
    async with get_async_blocks_session() as blocks_db:
        block_rows = (
            await blocks_db.execute(
                select(BlockPrimitive).where(
                    BlockPrimitive.tags.op("->>")(CONTENT_PACK_SOURCE_KEY) == source_pack_name
                )
            )
        ).scalars().all()

        for row in block_rows:
            tags = dict(row.tags or {})
            changed = False

            if tags.get(CONTENT_PACK_SOURCE_KEY) == source_pack_name:
                tags[CONTENT_PACK_SOURCE_KEY] = target_pack_name
                changed = True

            source_pack = tags.get("source_pack")
            if isinstance(source_pack, str) and source_pack == source_pack_name:
                tags["source_pack"] = target_pack_name
                result["block_source_pack_renamed"] += 1
                changed = True

            if changed:
                row.tags = tags
                row.updated_at = now
                result["blocks_adopted"] += 1

        await blocks_db.commit()

    template_rows = (
        await db.execute(
            select(BlockTemplate).where(
                BlockTemplate.template_metadata.op("->>")(CONTENT_PACK_SOURCE_KEY) == source_pack_name
            )
        )
    ).scalars().all()

    for row in template_rows:
        changed = False

        next_metadata, metadata_changed = _rewrite_pack_metadata(
            row.template_metadata if isinstance(row.template_metadata, dict) else {},
            source_pack_name=source_pack_name,
            target_pack_name=target_pack_name,
        )
        if metadata_changed:
            row.template_metadata = next_metadata
            changed = True

        if rewrite_package_names:
            if isinstance(row.package_name, str) and row.package_name.strip() == source_pack_name:
                row.package_name = target_pack_name
                result["template_package_renamed"] += 1
                changed = True

            if isinstance(row.slots, list):
                rewritten_slots: List[Any] = []
                slot_changed = False
                for slot in row.slots:
                    if isinstance(slot, dict):
                        next_slot = dict(slot)
                        slot_package = next_slot.get("package_name")
                        if isinstance(slot_package, str) and slot_package.strip() == source_pack_name:
                            next_slot["package_name"] = target_pack_name
                            result["slot_package_renamed"] += 1
                            slot_changed = True
                        rewritten_slots.append(next_slot)
                    else:
                        rewritten_slots.append(slot)
                if slot_changed:
                    row.slots = rewritten_slots
                    changed = True

        if changed:
            row.updated_at = now
            result["templates_adopted"] += 1

    character_rows = (
        await db.execute(
            select(Character).where(
                Character.character_metadata.op("->>")(CONTENT_PACK_SOURCE_KEY) == source_pack_name
            )
        )
    ).scalars().all()

    for row in character_rows:
        next_metadata, metadata_changed = _rewrite_pack_metadata(
            row.character_metadata if isinstance(row.character_metadata, dict) else {},
            source_pack_name=source_pack_name,
            target_pack_name=target_pack_name,
        )
        if not metadata_changed:
            continue
        row.character_metadata = next_metadata
        row.updated_at = now
        result["characters_adopted"] += 1

    await db.commit()

    logger.info(
        "content_pack_adopted",
        source_pack=source_pack_name,
        target_pack=target_pack_name,
        **{k: v for k, v in result.items() if v},
    )

    return result


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
