"""Unit tests for chain executor operation parsing/aliases."""

from __future__ import annotations

import pytest

from pixsim7.backend.main.domain.enums import OperationType
from pixsim7.backend.main.services.generation.chain_executor import _coerce_operation_type


def test_coerce_operation_type_accepts_canonical_value():
    assert _coerce_operation_type("text_to_image") == OperationType.TEXT_TO_IMAGE


@pytest.mark.parametrize(
    ("alias", "expected"),
    [
        ("txt2img", OperationType.TEXT_TO_IMAGE),
        ("t2i", OperationType.TEXT_TO_IMAGE),
        ("img2img", OperationType.IMAGE_TO_IMAGE),
        ("i2i", OperationType.IMAGE_TO_IMAGE),
        ("img2vid", OperationType.IMAGE_TO_VIDEO),
        ("i2v", OperationType.IMAGE_TO_VIDEO),
    ],
)
def test_coerce_operation_type_accepts_common_aliases(alias, expected):
    assert _coerce_operation_type(alias) == expected


def test_coerce_operation_type_raises_on_invalid():
    with pytest.raises(RuntimeError, match="Unsupported step operation"):
        _coerce_operation_type("totally_invalid_op")

