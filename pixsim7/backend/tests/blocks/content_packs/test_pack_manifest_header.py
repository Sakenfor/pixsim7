"""Tests for `pack_manifest_header.read_pack_manifest_header`.

The shared header reader is the single source of truth for pack-level metadata
(id, title, description, version, category). It feeds the inventory endpoint
(prompt + primitives packs) and the primitives loader's manifest result.
"""
from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

import pytest
import yaml

from pixsim7.backend.main.services.prompt.block.pack_manifest_header import (
    ManifestValidationError,
    PackManifestHeader,
    read_pack_manifest_header,
)


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def _tempdir() -> Path:
    return Path(f"test_artifacts_pack_{uuid4().hex}")


def test_full_header_round_trips() -> None:
    root = _tempdir()
    try:
        _write_yaml(
            root / "manifest.yaml",
            {
                "id": "core_camera",
                "title": "Core Camera",
                "description": "Camera primitives",
                "version": "1.2.0",
                "category": "camera",
            },
        )
        header = read_pack_manifest_header(root)
        assert header == PackManifestHeader(
            id="core_camera",
            title="Core Camera",
            description="Camera primitives",
            version="1.2.0",
            category="camera",
        )
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_missing_manifest_returns_none() -> None:
    root = _tempdir()
    try:
        root.mkdir(parents=True, exist_ok=True)
        assert read_pack_manifest_header(root) is None
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_partial_header_fields_default_to_none() -> None:
    """Only `category` set; the rest stay None."""
    root = _tempdir()
    try:
        _write_yaml(root / "manifest.yaml", {"category": "mood"})
        header = read_pack_manifest_header(root)
        assert header is not None
        assert header.category == "mood"
        assert header.id is None
        assert header.title is None
        assert header.description is None
        assert header.version is None
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_whitespace_is_trimmed_to_none_when_blank() -> None:
    root = _tempdir()
    try:
        _write_yaml(
            root / "manifest.yaml",
            {"id": "  core  ", "category": "   "},
        )
        header = read_pack_manifest_header(root)
        assert header is not None
        assert header.id == "core"
        assert header.category is None
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_non_string_category_raises() -> None:
    root = _tempdir()
    try:
        _write_yaml(root / "manifest.yaml", {"category": 42})
        with pytest.raises(ManifestValidationError, match="category must be a string"):
            read_pack_manifest_header(root)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_non_string_version_raises() -> None:
    root = _tempdir()
    try:
        _write_yaml(root / "manifest.yaml", {"version": 1.0})
        with pytest.raises(ManifestValidationError, match="version must be a string"):
            read_pack_manifest_header(root)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_subdirectory_manifest_is_ignored() -> None:
    """Only the root manifest is read. `blocks/.../manifest.yaml` is matrix-preset
    territory and must not bleed into the pack-level header."""
    root = _tempdir()
    try:
        _write_yaml(root / "manifest.yaml", {"category": "camera"})
        _write_yaml(
            root / "blocks" / "wardrobe" / "manifest.yaml",
            {"category": "wardrobe"},  # would bleed if reader walked subdirs
        )
        header = read_pack_manifest_header(root)
        assert header is not None
        assert header.category == "camera"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_manifest_yml_extension_also_recognized() -> None:
    root = _tempdir()
    try:
        _write_yaml(root / "manifest.yml", {"category": "color"})
        header = read_pack_manifest_header(root)
        assert header is not None
        assert header.category == "color"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_unknown_fields_are_silently_ignored() -> None:
    """Legacy plural `categories: [...]` and other unrecognized keys must not break
    the reader (they were ignored before and remain ignored after Phase 1.5)."""
    root = _tempdir()
    try:
        _write_yaml(
            root / "manifest.yaml",
            {
                "id": "scene_foundation",
                "version": "1.0.0",
                "categories": ["light", "color", "camera"],  # legacy plural
                "weird_field": {"nested": True},
            },
        )
        header = read_pack_manifest_header(root)
        assert header is not None
        assert header.id == "scene_foundation"
        assert header.version == "1.0.0"
        assert header.category is None  # singular not declared
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_to_dict_matches_dataclass_fields() -> None:
    header = PackManifestHeader(
        id="x",
        title="X",
        description="d",
        version="1",
        category="c",
    )
    assert header.to_dict() == {
        "id": "x",
        "title": "X",
        "description": "d",
        "version": "1",
        "category": "c",
    }
