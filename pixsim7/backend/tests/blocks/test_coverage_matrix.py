"""Tests for `services.prompt.block.coverage.compute_coverage_matrix`.

Uses a synthetic primitives root with two packs of contrived blocks so
the test doesn't depend on real content_packs evolving.
"""
from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from pixsim7.backend.main.services.prompt.block.coverage import (
    compute_coverage_matrix,
)


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content), encoding="utf-8")


@pytest.fixture
def synthetic_primitives_root(tmp_path: Path) -> Path:
    root = tmp_path / "primitives"

    # Pack A: two color primitives, one with a real text match and one without
    _write(
        root / "pack_a" / "blocks" / "color.yaml",
        """
        package_name: pack_a
        blocks:
          - block_id: pack_a.color.amber
            category: color
            text: warm amber tones
            tags:
              ontology_ids: [color:amber, mood:tender]
          - block_id: pack_a.color.cool
            category: color
            text: cool blue cast
            tags:
              ontology_ids: [color:cool_blue]
        """,
    )

    # Pack B: a camera primitive (different category, different namespace coverage)
    _write(
        root / "pack_b" / "blocks" / "camera.yaml",
        """
        package_name: pack_b
        blocks:
          - block_id: pack_b.camera.low
            category: camera
            text: low angle perspective
            tags:
              ontology_ids: [camera:angle_low]
          - block_id: pack_b.camera.zero
            category: camera
            text: zero-coverage primitive
            tags: {}
        """,
    )

    return root


def test_compute_coverage_matrix_by_category(synthetic_primitives_root: Path) -> None:
    matrix = compute_coverage_matrix(
        row_axis="category",
        primitives_root=synthetic_primitives_root,
    )

    assert matrix.grand_total == 4
    assert set(matrix.rows) == {"color", "camera"}

    # Cell index for easy lookup
    cell_at = {(c.row, c.col): c for c in matrix.cells}

    # color × color: both color primitives carry color:* IDs → 2/2
    color_color = cell_at[("color", "color")]
    assert color_color.matched_count == 2
    assert color_color.total == 2
    assert color_color.ratio == pytest.approx(1.0)

    # color × mood: only one color primitive carries mood:tender → 1/2
    color_mood = cell_at[("color", "mood")]
    assert color_mood.matched_count == 1
    assert color_mood.total == 2
    assert color_mood.ratio == pytest.approx(0.5)

    # camera × camera: 1 of 2 (zero-coverage primitive has no ontology_ids)
    camera_camera = cell_at[("camera", "camera")]
    assert camera_camera.matched_count == 1
    assert camera_camera.total == 2
    assert camera_camera.ratio == pytest.approx(0.5)

    # camera × color: zero (camera primitives don't carry color:*)
    camera_color = cell_at[("camera", "color")]
    assert camera_color.matched_count == 0
    assert camera_color.ratio == 0.0


def test_compute_coverage_matrix_by_pack(synthetic_primitives_root: Path) -> None:
    matrix = compute_coverage_matrix(
        row_axis="pack",
        primitives_root=synthetic_primitives_root,
    )
    assert set(matrix.rows) == {"pack_a", "pack_b"}
    cell_at = {(c.row, c.col): c for c in matrix.cells}
    assert cell_at[("pack_a", "color")].matched_count == 2
    assert cell_at[("pack_b", "camera")].matched_count == 1


def test_compute_coverage_matrix_to_dict_shape(
    synthetic_primitives_root: Path,
) -> None:
    """The serialized payload matches the FastAPI response_model expectations."""
    matrix = compute_coverage_matrix(
        row_axis="category",
        primitives_root=synthetic_primitives_root,
    )
    payload = matrix.to_dict()
    assert payload["row_axis"] == "category"
    assert payload["col_axis"] == "namespace"
    assert isinstance(payload["cells"], list)
    assert all(
        {"row", "col", "matched_count", "total", "ratio", "samples"} <= c.keys()
        for c in payload["cells"]
    )
    sample_cell = payload["cells"][0]
    if sample_cell["samples"]:
        assert {"block_id", "text_preview"} <= sample_cell["samples"][0].keys()
    assert payload["skipped_packs"] == []


def test_compute_coverage_matrix_missing_root(tmp_path: Path) -> None:
    matrix = compute_coverage_matrix(
        row_axis="category",
        primitives_root=tmp_path / "does-not-exist",
    )
    assert matrix.grand_total == 0
    assert matrix.rows == []
    assert matrix.cells == []
