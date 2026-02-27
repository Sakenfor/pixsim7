"""
Content-pack loader — discovers and loads blocks, templates, and characters
from content_packs/prompt/ directories into the database.

Layout:
    Single-file (legacy, still supported):
        content_packs/prompt/<pack_name>/blocks.yaml
        content_packs/prompt/<pack_name>/templates.yaml
        content_packs/prompt/<pack_name>/characters.yaml

    Multi-file (authoring convenience):
        content_packs/prompt/<pack_name>/blocks/*.yaml
        content_packs/prompt/<pack_name>/templates/*.yaml
        content_packs/prompt/<pack_name>/characters/*.yaml

    When both a single file and a directory exist (e.g. blocks.yaml + blocks/*.yaml),
    all sources are merged (single file first, then directory files in name order).

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

from pixsim7.backend.main.services.prompt.block.template_controls import (
    expand_control_presets,
)
from pixsim7.backend.main.services.prompt.block.template_features import (
    expand_template_feature_presets,
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

CONTENT_PACKS_DIR = Path(__file__).resolve().parents[3] / "content_packs" / "prompt"
CONTENT_PACK_SOURCE_KEY = "content_pack"
_YAML_SUFFIXES = (".yaml", ".yml")


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


def _iter_pack_sources(content_dir: Path, stem: str) -> List[Path]:
    """Return ordered YAML sources for a pack section (blocks/templates/characters)."""
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
    if any((content_dir / f"{stem}{suffix}").exists() for suffix in _YAML_SUFFIXES):
        return True
    fragments_dir = content_dir / stem
    if not fragments_dir.is_dir():
        return False
    return any(
        f.is_file() and f.suffix in _YAML_SUFFIXES
        for f in fragments_dir.rglob("*")
    )


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
    """Return pack names under content_packs/prompt/."""
    if not CONTENT_PACKS_DIR.exists():
        return []
    return sorted(
        d.name for d in CONTENT_PACKS_DIR.iterdir()
        if d.is_dir() and (
            _has_any_pack_source(d, "blocks")
            or _has_any_pack_source(d, "templates")
            or _has_any_pack_source(d, "characters")
        )
    )


def parse_blocks(content_dir: Path) -> List[Dict[str, Any]]:
    """Parse blocks YAML sources, merging defaults into each block."""
    sources = _iter_pack_sources(content_dir, "blocks")
    if not sources:
        return []

    # Pack-level defaults can be provided by the single-file source (blocks.yaml)
    # and apply to all fragment files too.
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

        # Treat the first single-file source as pack defaults (if present).
        if pack_defaults_source is None and src.parent == content_dir and src.stem == "blocks":
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

            tags = block.get("tags")
            if tags is None:
                block["tags"] = {}
            elif not isinstance(tags, dict):
                raise ContentPackValidationError(
                    f"{src}: blocks[{index}].tags must be an object"
                )
            try:
                validate_block_family_contract(
                    block=block,
                    path=src,
                    index=index,
                    family_schemas=family_schemas,
                )
            except BlockFamilyContractValidationError as exc:
                raise ContentPackValidationError(str(exc)) from exc

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


# ── Manifest query field type sets ──────────────────────────────────────────
_MANIFEST_QUERY_STRING_FIELDS: frozenset[str] = frozenset({
    "role", "category", "package_name", "tags",
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
              - role: str?
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
