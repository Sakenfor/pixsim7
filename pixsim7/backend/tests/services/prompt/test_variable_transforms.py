from __future__ import annotations

import pytest

from pixsim7.backend.main.services.prompt.variable_transforms import (
    apply_transform,
    is_known_transform,
    parse_transform_spec,
)


def test_parse_spec_splits_id_and_arg() -> None:
    assert parse_transform_spec("spaced:__") == ("spaced", "__")
    assert parse_transform_spec("upper") == ("upper", None)
    # id is lower-cased/trimmed; arg keeps exact chars (even an empty one).
    assert parse_transform_spec("  SPACED : x") == ("spaced", " x")
    assert parse_transform_spec("spaced:") == ("spaced", "")


def test_spaced_inserts_separator_between_characters() -> None:
    assert apply_transform("spaced:__", "cat") == "c__a__t"
    # Empty arg falls back to a single space (matches `spaced` with no arg).
    assert apply_transform("spaced", "cat") == "c a t"
    assert apply_transform("spaced:", "cat") == "c a t"


def test_upper_and_lower() -> None:
    assert apply_transform("upper", "cat") == "CAT"
    assert apply_transform("lower", "CAT") == "cat"


def test_unknown_or_empty_spec_is_noop() -> None:
    assert apply_transform("nope", "cat") == "cat"
    assert apply_transform("", "cat") == "cat"
    assert apply_transform(None, "cat") == "cat"


def test_is_known_transform() -> None:
    assert is_known_transform("spaced:__") is True
    assert is_known_transform("UPPER") is True
    assert is_known_transform("bogus") is False


@pytest.mark.parametrize("value", ["", "a"])
def test_spaced_edge_lengths(value: str) -> None:
    # 0 or 1 chars: nothing to interleave.
    assert apply_transform("spaced:__", value) == value
