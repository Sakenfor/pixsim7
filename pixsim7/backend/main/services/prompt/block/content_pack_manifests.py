"""Manifest parsing helpers for content-pack matrix presets."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import yaml

from pixsim7.backend.main.services.prompt.block.family_contract_validation import (
    load_prompt_block_family_schemas,
    load_prompt_block_tag_keys,
)

_YAML_SUFFIXES = (".yaml", ".yml")

MANIFEST_QUERY_STRING_FIELDS: frozenset[str] = frozenset(
    {
        "role",
        "composition_role",
        "category",
        "package_name",
        "tags",
        "expected_row_values",
        "expected_col_values",
        "expected_tag_keys",
        "required_tag_keys",
    }
)
MANIFEST_QUERY_BOOL_FIELDS: frozenset[str] = frozenset({"include_empty", "include_drift_report"})
MANIFEST_QUERY_INT_FIELDS: frozenset[str] = frozenset({"limit"})


class ManifestValidationError(ValueError):
    """Raised when a manifest file payload is invalid."""


def _load_yaml(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ManifestValidationError(f"{path}: top-level YAML must be an object")
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
        raise ManifestValidationError(
            f"{path}: {section}[{index}].{field} must be a non-empty string"
        )
    return value.strip()


def _ensure_optional_string(*, value: Any, path: Path, field: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ManifestValidationError(f"{path}: {field} must be a string")
    stripped = value.strip()
    return stripped or None


def normalize_manifest_query(
    *,
    query: Dict[str, Any],
    src: Path,
    preset_index: int,
) -> Dict[str, Any]:
    """Validate types and normalize a manifest query object."""
    normalized = dict(query)
    normalized["row_key"] = str(normalized["row_key"]).strip()
    normalized["col_key"] = str(normalized["col_key"]).strip()

    for field in MANIFEST_QUERY_STRING_FIELDS:
        value = normalized.get(field)
        if value is None:
            continue
        if not isinstance(value, str):
            raise ManifestValidationError(
                f"{src}: matrix_presets[{preset_index}].query.{field} must be a string"
            )
        normalized[field] = value.strip()

    for field in MANIFEST_QUERY_BOOL_FIELDS:
        value = normalized.get(field)
        if value is None:
            continue
        if not isinstance(value, bool):
            raise ManifestValidationError(
                f"{src}: matrix_presets[{preset_index}].query.{field} must be a boolean"
            )

    for field in MANIFEST_QUERY_INT_FIELDS:
        value = normalized.get(field)
        if value is None:
            continue
        if isinstance(value, bool) or not isinstance(value, int):
            raise ManifestValidationError(
                f"{src}: matrix_presets[{preset_index}].query.{field} must be an integer"
            )

    if (
        isinstance(normalized.get("role"), str)
        and normalized.get("role")
        and not isinstance(normalized.get("composition_role"), str)
    ):
        normalized["composition_role"] = normalized["role"]

    return normalized


def validate_manifest_query_registry(
    *,
    query: Dict[str, Any],
    src: Path,
    preset_index: int,
    family_schemas: Dict[str, Any],
    known_tag_keys: frozenset[str],
) -> None:
    """Validate registry-referenced values inside a manifest query."""
    tags_str = query.get("tags")
    if isinstance(tags_str, str) and family_schemas:
        for part in tags_str.split(","):
            part = part.strip()
            kv = part.split(":", 1)
            if len(kv) == 2 and kv[0].strip() == "sequence_family":
                family_id = kv[1].strip()
                if family_id and family_id not in family_schemas:
                    known = ", ".join(sorted(family_schemas.keys()))
                    raise ManifestValidationError(
                        f"{src}: matrix_presets[{preset_index}].query.tags references "
                        f"unknown sequence_family '{family_id}'"
                        + (f" (known: {known})" if known else "")
                    )

    if known_tag_keys:
        for field in ("row_key", "col_key"):
            value = query.get(field, "")
            if isinstance(value, str) and value.startswith("tag:"):
                tag_key = value[4:].strip()
                if tag_key and tag_key not in known_tag_keys:
                    raise ManifestValidationError(
                        f"{src}: matrix_presets[{preset_index}].query.{field} references "
                        f"unknown tag key '{tag_key}' (not registered in prompt_block_tags)"
                    )


def _parse_compact_tags(tags_str: str) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for part in tags_str.split(","):
        part = part.strip()
        kv = part.split(":", 1)
        if len(kv) == 2:
            key, value = kv[0].strip(), kv[1].strip()
            if key and key not in result:
                result[key] = value
    return result


def validate_manifest_query_family_axes(
    *,
    query: Dict[str, Any],
    src: Path,
    preset_index: int,
    family_schemas: Dict[str, Any],
) -> None:
    """Validate family axis and expected-values coherence for a query."""
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
        return

    axis_tag_key = str(family_schema.get("axis_tag_key") or "beat_axis")
    axis_id = tag_pairs.get(axis_tag_key)
    if not axis_id:
        return

    axes = family_schema.get("axes") or {}
    if not isinstance(axes, dict):
        return

    if axis_id not in axes:
        valid_axes = ", ".join(sorted(str(key) for key in axes.keys()))
        raise ManifestValidationError(
            f"{src}: matrix_presets[{preset_index}].query.tags references "
            f"unknown axis '{axis_id}' for family '{family_id}'"
            + (f" (valid: {valid_axes})" if valid_axes else "")
        )

    axis_schema = axes.get(axis_id) or {}
    expected_values_map = axis_schema.get("expected_values") or {}
    if not isinstance(expected_values_map, dict) or not expected_values_map:
        return

    for axis_field, expected_field in (
        ("row_key", "expected_row_values"),
        ("col_key", "expected_col_values"),
    ):
        key_ref = query.get(axis_field, "")
        expected_csv = query.get(expected_field)
        if not isinstance(key_ref, str) or not isinstance(expected_csv, str):
            continue
        if not key_ref.startswith("tag:"):
            continue
        tag_key = key_ref[4:].strip()
        if not tag_key or tag_key not in expected_values_map:
            continue

        allowed_raw = expected_values_map[tag_key]
        allowed = {str(v) for v in (allowed_raw if isinstance(allowed_raw, list) else [allowed_raw])}
        for value in expected_csv.split(","):
            value = value.strip()
            if value and value not in allowed:
                allowed_display = ", ".join(sorted(allowed))
                raise ManifestValidationError(
                    f"{src}: matrix_presets[{preset_index}].query.{expected_field} value '{value}' "
                    f"is not valid for family '{family_id}' axis '{axis_id}' "
                    f"tag '{tag_key}' (expected one of: {allowed_display})"
                )


def iter_pack_manifest_sources(content_dir: Path) -> List[Path]:
    """Return manifest.(yaml|yml) sources within a content pack."""
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
            sources.extend(
                path
                for path in base.rglob(f"*{suffix}")
                if path.is_file() and path.stem == "manifest"
            )

    return sorted(set(sources))


def parse_manifests(content_dir: Path, *, pack_name: str) -> List[Dict[str, Any]]:
    """Parse optional content-pack manifests for matrix query presets."""
    sources = iter_pack_manifest_sources(content_dir)
    if not sources:
        return []

    family_schemas = load_prompt_block_family_schemas()
    known_tag_keys = load_prompt_block_tag_keys()

    manifests: List[Dict[str, Any]] = []
    seen_manifest_ids: Dict[str, Path] = {}

    for src in sources:
        data = _load_yaml(src)
        if not isinstance(data, dict):
            raise ManifestValidationError(f"{src}: manifest must be an object")

        matrix_presets = data.get("matrix_presets")
        if matrix_presets is None:
            continue
        if not isinstance(matrix_presets, list):
            raise ManifestValidationError(f"{src}: matrix_presets must be a list")

        parsed_presets: List[Dict[str, Any]] = []
        seen_preset_labels: Dict[str, int] = {}

        for index, raw in enumerate(matrix_presets):
            if not isinstance(raw, dict):
                raise ManifestValidationError(f"{src}: matrix_presets[{index}] must be an object")

            label = _required_non_empty_string(
                value=raw.get("label"),
                path=src,
                section="matrix_presets",
                index=index,
                field="label",
            )
            if label in seen_preset_labels:
                raise ManifestValidationError(
                    f"{src}: matrix_presets[{index}].label '{label}' duplicates "
                    f"matrix_presets[{seen_preset_labels[label]}].label"
                )
            seen_preset_labels[label] = index

            query = raw.get("query")
            if not isinstance(query, dict):
                raise ManifestValidationError(
                    f"{src}: matrix_presets[{index}].query must be an object"
                )

            row_key = query.get("row_key")
            col_key = query.get("col_key")
            if not isinstance(row_key, str) or not row_key.strip():
                raise ManifestValidationError(
                    f"{src}: matrix_presets[{index}].query.row_key must be a non-empty string"
                )
            if not isinstance(col_key, str) or not col_key.strip():
                raise ManifestValidationError(
                    f"{src}: matrix_presets[{index}].query.col_key must be a non-empty string"
                )

            normalized_query = normalize_manifest_query(query=query, src=src, preset_index=index)
            validate_manifest_query_registry(
                query=normalized_query,
                src=src,
                preset_index=index,
                family_schemas=family_schemas,
                known_tag_keys=known_tag_keys,
            )
            validate_manifest_query_family_axes(
                query=normalized_query,
                src=src,
                preset_index=index,
                family_schemas=family_schemas,
            )
            parsed_presets.append({"label": label, "query": normalized_query})

        manifest_id = _ensure_optional_string(value=data.get("id"), path=src, field="id")
        if manifest_id is not None:
            if manifest_id in seen_manifest_ids:
                raise ManifestValidationError(
                    f"{src}: manifest id '{manifest_id}' already defined in {seen_manifest_ids[manifest_id]}"
                )
            seen_manifest_ids[manifest_id] = src

        manifests.append(
            {
                "pack_name": pack_name,
                "source": str(src.relative_to(content_dir).as_posix()),
                "id": manifest_id,
                "title": _ensure_optional_string(value=data.get("title"), path=src, field="title"),
                "description": _ensure_optional_string(
                    value=data.get("description"),
                    path=src,
                    field="description",
                ),
                "matrix_presets": parsed_presets,
            }
        )

    return manifests
