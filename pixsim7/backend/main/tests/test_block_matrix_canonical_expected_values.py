from __future__ import annotations

from pixsim7.backend.main.api.v1.block_templates import _extend_axis_values_from_canonical_dictionary


def test_matrix_axis_extends_allowed_values_for_tag_axis_when_include_empty() -> None:
    values: set[str] = set()
    _extend_axis_values_from_canonical_dictionary(
        values,
        "tag:allure_level",
        include_empty=True,
        expected_values_csv=None,
    )
    assert {"preserve", "subtle", "medium", "high"}.issubset(values)


def test_matrix_axis_does_not_extend_when_include_empty_false() -> None:
    values: set[str] = set()
    _extend_axis_values_from_canonical_dictionary(
        values,
        "tag:allure_level",
        include_empty=False,
        expected_values_csv=None,
    )
    assert values == set()


def test_matrix_axis_expected_csv_wins() -> None:
    values: set[str] = {"observed"}
    _extend_axis_values_from_canonical_dictionary(
        values,
        "tag:allure_level",
        include_empty=True,
        expected_values_csv="x,y",
    )
    assert "x" in values and "y" in values
    assert "preserve" not in values, "explicit expected list should prevent canonical injection"

