from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

import pytest
import yaml

from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
    ContentPackValidationError,
    parse_manifests,
)


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


# ── Existing tests (unchanged) ───────────────────────────────────────────────

def test_parse_manifests_collects_matrix_presets() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "wardrobe" / "skirts" / "manifest.yaml",
            {
                "id": "x",
                "matrix_presets": [
                    {
                        "label": "Skirt shapes",
                        "query": {"row_key": "tag:wardrobe_axis", "col_key": "tag:skirt_shape"},
                    }
                ],
            },
        )

        manifests = parse_manifests(root, pack_name="testpack")
        assert len(manifests) == 1
        m = manifests[0]
        assert m["pack_name"] == "testpack"
        assert m["id"] == "x"
        assert m["matrix_presets"][0]["label"] == "Skirt shapes"
        assert m["matrix_presets"][0]["query"]["row_key"] == "tag:wardrobe_axis"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_ignores_files_without_matrix_presets() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(root / "blocks" / "manifest.yaml", {"not_a_manifest": True})
        assert parse_manifests(root, pack_name="testpack") == []
    finally:
        shutil.rmtree(root, ignore_errors=True)


# ── Priority 3: Duplicate / ID collision ─────────────────────────────────────

def test_parse_manifests_duplicate_label_within_manifest_raises() -> None:
    """Two presets with the same label in one manifest file must raise."""
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {"label": "Axis coverage", "query": {"row_key": "role", "col_key": "tag:beat_axis"}},
                    {"label": "Axis coverage", "query": {"row_key": "role", "col_key": "tag:beat_axis"}},
                ]
            },
        )
        with pytest.raises(ContentPackValidationError, match="duplicates"):
            parse_manifests(root, pack_name="testpack")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_duplicate_manifest_id_across_files_raises() -> None:
    """The same manifest id used in two files within a pack must raise."""
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "a" / "manifest.yaml",
            {
                "id": "collision",
                "matrix_presets": [
                    {"label": "A preset", "query": {"row_key": "role", "col_key": "role"}},
                ],
            },
        )
        _write_yaml(
            root / "blocks" / "b" / "manifest.yaml",
            {
                "id": "collision",
                "matrix_presets": [
                    {"label": "B preset", "query": {"row_key": "role", "col_key": "role"}},
                ],
            },
        )
        with pytest.raises(ContentPackValidationError, match="already defined"):
            parse_manifests(root, pack_name="testpack")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_unique_ids_across_files_passes() -> None:
    """Different manifest ids in different files must not raise."""
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "a" / "manifest.yaml",
            {
                "id": "pack.a",
                "matrix_presets": [
                    {"label": "A preset", "query": {"row_key": "role", "col_key": "role"}},
                ],
            },
        )
        _write_yaml(
            root / "blocks" / "b" / "manifest.yaml",
            {
                "id": "pack.b",
                "matrix_presets": [
                    {"label": "B preset", "query": {"row_key": "role", "col_key": "role"}},
                ],
            },
        )
        manifests = parse_manifests(root, pack_name="testpack")
        assert len(manifests) == 2
    finally:
        shutil.rmtree(root, ignore_errors=True)


# ── Priority 1 & 2: Schema validation + normalization ────────────────────────

def test_parse_manifests_include_empty_must_be_bool() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {"label": "X", "query": {"row_key": "role", "col_key": "role", "include_empty": "yes"}},
                ]
            },
        )
        with pytest.raises(ContentPackValidationError, match="must be a boolean"):
            parse_manifests(root, pack_name="testpack")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_include_drift_report_must_be_bool() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {"label": "X", "query": {"row_key": "role", "col_key": "role", "include_drift_report": 1}},
                ]
            },
        )
        with pytest.raises(ContentPackValidationError, match="must be a boolean"):
            parse_manifests(root, pack_name="testpack")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_limit_must_be_int() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {"label": "X", "query": {"row_key": "role", "col_key": "role", "limit": "50"}},
                ]
            },
        )
        with pytest.raises(ContentPackValidationError, match="must be an integer"):
            parse_manifests(root, pack_name="testpack")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_limit_bool_rejected_as_int() -> None:
    """Python bools are ints; manifests must not accept True as a limit value."""
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {"label": "X", "query": {"row_key": "role", "col_key": "role", "limit": True}},
                ]
            },
        )
        with pytest.raises(ContentPackValidationError, match="must be an integer"):
            parse_manifests(root, pack_name="testpack")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_role_must_be_string() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {"label": "X", "query": {"row_key": "role", "col_key": "role", "role": 42}},
                ]
            },
        )
        with pytest.raises(ContentPackValidationError, match="must be a string"):
            parse_manifests(root, pack_name="testpack")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_trims_whitespace_from_row_and_col_keys() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {"label": "X", "query": {"row_key": "  tag:beat_axis  ", "col_key": "  role  "}},
                ]
            },
        )
        manifests = parse_manifests(root, pack_name="testpack")
        q = manifests[0]["matrix_presets"][0]["query"]
        assert q["row_key"] == "tag:beat_axis"
        assert q["col_key"] == "role"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_trims_whitespace_from_optional_string_fields() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {
                        "label": "X",
                        "query": {
                            "row_key": "role",
                            "col_key": "role",
                            "role": "  style  ",
                            "category": "  wardrobe  ",
                            "package_name": "  shared  ",
                        },
                    }
                ]
            },
        )
        manifests = parse_manifests(root, pack_name="testpack")
        q = manifests[0]["matrix_presets"][0]["query"]
        assert q["role"] == "style"
        assert q["category"] == "wardrobe"
        assert q["package_name"] == "shared"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_valid_bool_and_int_fields_pass() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {
                        "label": "X",
                        "query": {
                            "row_key": "role",
                            "col_key": "role",
                            "include_empty": True,
                            "include_drift_report": False,
                            "limit": 100,
                        },
                    }
                ]
            },
        )
        manifests = parse_manifests(root, pack_name="testpack")
        q = manifests[0]["matrix_presets"][0]["query"]
        assert q["include_empty"] is True
        assert q["include_drift_report"] is False
        assert q["limit"] == 100
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_unknown_query_fields_are_preserved() -> None:
    """Unknown query fields must be passed through unchanged (forward compat)."""
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {
                        "label": "X",
                        "query": {
                            "row_key": "role",
                            "col_key": "role",
                            "future_field": "some_value",
                        },
                    }
                ]
            },
        )
        manifests = parse_manifests(root, pack_name="testpack")
        assert manifests[0]["matrix_presets"][0]["query"].get("future_field") == "some_value"
    finally:
        shutil.rmtree(root, ignore_errors=True)


# ── Priority 4: Registry-aware validation ────────────────────────────────────

def test_parse_manifests_unknown_sequence_family_in_tags_raises() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {
                        "label": "X",
                        "query": {
                            "row_key": "tag:beat_axis",
                            "col_key": "role",
                            "tags": "sequence_family:nonexistent_xyz_family",
                        },
                    }
                ]
            },
        )
        with pytest.raises(ContentPackValidationError, match="unknown sequence_family"):
            parse_manifests(root, pack_name="testpack")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_known_sequence_family_in_tags_passes() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {
                        "label": "X",
                        "query": {
                            "row_key": "tag:beat_axis",
                            "col_key": "role",
                            "tags": "sequence_family:public_social_idle,beat_axis:environment",
                        },
                    }
                ]
            },
        )
        manifests = parse_manifests(root, pack_name="testpack")
        assert len(manifests) == 1
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_unknown_tag_key_in_row_key_raises() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {
                        "label": "X",
                        "query": {
                            "row_key": "tag:totally_unknown_tag_xyz_9999",
                            "col_key": "role",
                        },
                    }
                ]
            },
        )
        with pytest.raises(ContentPackValidationError, match="unknown tag key"):
            parse_manifests(root, pack_name="testpack")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_unknown_tag_key_in_col_key_raises() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {
                        "label": "X",
                        "query": {
                            "row_key": "role",
                            "col_key": "tag:totally_unknown_col_xyz_9999",
                        },
                    }
                ]
            },
        )
        with pytest.raises(ContentPackValidationError, match="unknown tag key"):
            parse_manifests(root, pack_name="testpack")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_known_tag_keys_pass() -> None:
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {
                        "label": "X",
                        "query": {
                            "row_key": "tag:beat_axis",
                            "col_key": "tag:sequence_family",
                        },
                    }
                ]
            },
        )
        manifests = parse_manifests(root, pack_name="testpack")
        assert len(manifests) == 1
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_non_tag_prefixed_col_key_skips_registry_check() -> None:
    """Plain field names like 'role' in col_key are not validated against tag registry."""
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {
                        "label": "X",
                        "query": {"row_key": "tag:beat_axis", "col_key": "role"},
                    }
                ]
            },
        )
        manifests = parse_manifests(root, pack_name="testpack")
        assert manifests[0]["matrix_presets"][0]["query"]["col_key"] == "role"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_manifests_deprecated_tag_key_passes() -> None:
    """Deprecated (but registered) tag keys like 'silhouette' must still pass."""
    root = Path(f"test_artifacts_pack_{uuid4().hex}")
    try:
        _write_yaml(
            root / "blocks" / "manifest.yaml",
            {
                "matrix_presets": [
                    {
                        "label": "X",
                        "query": {
                            "row_key": "tag:allure_level",
                            "col_key": "tag:silhouette",
                        },
                    }
                ]
            },
        )
        manifests = parse_manifests(root, pack_name="testpack")
        assert len(manifests) == 1
    finally:
        shutil.rmtree(root, ignore_errors=True)
