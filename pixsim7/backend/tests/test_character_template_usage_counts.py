"""Tests for character template-binding usage count overlay."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from pixsim7.backend.main.services.characters.character import CharacterService


class _ScalarList:
    def __init__(self, values):
        self._values = values

    def all(self):
        return list(self._values)


class _ScalarResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _ScalarList(self._values)


@pytest.mark.asyncio
async def test_apply_template_usage_counts_overlays_block_template_bindings():
    template_bindings_rows = [
        {
            "actor": {"character_id": "great_dane_01"},
            "her": {"character_id": "her_01"},
        },
        {
            "dog": {"character_id": "great_dane_01"},
            "empty": {"character_id": ""},
        },
        {
            "other": {"character_id": "someone_else"},
        },
        None,
        "not-a-dict",
    ]
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(template_bindings_rows))
    )
    service = CharacterService(db)

    chars = [
        SimpleNamespace(character_id="great_dane_01", usage_count=0),
        SimpleNamespace(character_id="her_01", usage_count=2),
        SimpleNamespace(character_id="unused_01", usage_count=1),
    ]

    await service.apply_template_usage_counts(chars)

    assert chars[0].usage_count == 2  # two bindings across templates
    assert chars[1].usage_count == 3  # existing usage_count + one template binding
    assert chars[2].usage_count == 1  # unchanged

