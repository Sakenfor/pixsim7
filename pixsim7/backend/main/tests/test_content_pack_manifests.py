from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

import yaml

from pixsim7.backend.main.services.prompt.block.content_pack_loader import parse_manifests


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


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
