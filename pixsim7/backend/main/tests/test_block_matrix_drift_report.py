from __future__ import annotations

from types import SimpleNamespace

from pixsim7.backend.main.api.v1.block_templates import _build_block_matrix_drift_report
from pixsim7.backend.main.api.v1.block_templates import _resolve_block_matrix_value


def _b(block_id: str, *, tags) -> SimpleNamespace:
    return SimpleNamespace(block_id=block_id, tags=tags)


def test_resolve_block_matrix_value_handles_non_dict_tags() -> None:
    block = _b("b1", tags=["not", "a", "dict"])
    assert _resolve_block_matrix_value(block, "sequence_family", missing_label="__m__") == "__m__"
    assert _resolve_block_matrix_value(block, "tag:sequence_family", missing_label="__m__") == "__m__"


def test_build_block_matrix_drift_report_axis_and_tag_drift() -> None:
    blocks = [
        _b("ok", tags={"sequence_family": "public_social_idle", "beat_axis": "activity"}),
        _b("missing_required", tags={"beat_axis": "activity"}),
        _b(
            "unexpected_axis_value",
            tags={
                "sequence_family": "unexpected_family",
                "beat_axis": "activity",
                "typo_tag": "x",
            },
        ),
        _b("dict_axis_value", tags={"sequence_family": {"k": "v"}, "beat_axis": "activity"}),
    ]

    drift = _build_block_matrix_drift_report(
        blocks=blocks,
        row_key="tag:sequence_family",
        col_key="tag:beat_axis",
        missing_label="__missing__",
        expected_row_values_csv="public_social_idle",
        expected_col_values_csv="activity",
        use_canonical_expected_values=False,
        expected_tag_keys_csv="sequence_family,beat_axis",
        required_tag_keys_csv="sequence_family",
        max_entries=50,
        max_examples_per_entry=5,
    )

    assert drift["row"]["missing_count"] == 1
    assert drift["row"]["dict_value_count"] == 1
    assert "unexpected_family" in drift["row"]["unexpected_values"]
    assert drift["col"]["missing_count"] == 0
    assert drift["col"]["unexpected_values"] == []

    unexpected_keys = {row["key"] for row in drift["tags"]["unexpected_keys_top"]}
    assert "typo_tag" in unexpected_keys

    missing_required = {row["key"] for row in drift["tags"]["missing_required_top"]}
    assert "sequence_family" in missing_required


def test_build_block_matrix_drift_report_ignores_missing_label_in_unexpected_values() -> None:
    blocks = [
        _b("missing", tags={"beat_axis": "tone"}),
        _b("present", tags={"sequence_family": "public_social_idle", "beat_axis": "tone"}),
    ]
    drift = _build_block_matrix_drift_report(
        blocks=blocks,
        row_key="tag:sequence_family",
        col_key="tag:beat_axis",
        missing_label="__missing__",
        expected_row_values_csv="public_social_idle",
        expected_col_values_csv="tone",
        use_canonical_expected_values=False,
        expected_tag_keys_csv=None,
        required_tag_keys_csv=None,
        max_entries=50,
        max_examples_per_entry=5,
    )
    assert drift["row"]["missing_count"] == 1
    assert drift["row"]["unexpected_values"] == []

