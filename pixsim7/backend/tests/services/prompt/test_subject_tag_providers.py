"""Tests for the subject-tag provider seam.

Locks in the character subject-tag derivation (verbatim port from tag_deriver)
and the registry dispatch, so a future location/prop provider can be added
without regressing character behavior.
"""
from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from pixsim7.backend.main.services.prompt.subject_tag_providers import (
    CharacterSubjectProvider,
    get_subject_tag_provider,
    register_subject_tag_provider,
)
from pixsim7.backend.main.services.prompt.tag_deriver import derive_structural_tags


class _Result:
    def __init__(self, obj):
        self._obj = obj

    def scalar_one_or_none(self):
        return self._obj


class _FakeDB:
    """Returns the same object for every execute() — enough for the single
    Character/NPC lookup these tests exercise."""

    def __init__(self, obj):
        self._obj = obj

    async def execute(self, _stmt):
        return _Result(self._obj)


def _char(species=None, category=None, archetype=None):
    return SimpleNamespace(species=species, category=category, archetype=archetype)


@pytest.mark.asyncio
async def test_character_provider_species_archetype_and_kind():
    char = _char(species="fox_spirit", category="creature", archetype="trickster")
    tags = await CharacterSubjectProvider().derive_tags(uuid4(), _FakeDB(char))
    # species drives character:, archetype drives archetype:, and kind: appears
    # because species != category.
    assert tags == ["character:fox-spirit", "archetype:trickster", "kind:creature"]


@pytest.mark.asyncio
async def test_character_provider_no_kind_when_species_equals_category():
    char = _char(species="human", category="human", archetype=None)
    tags = await CharacterSubjectProvider().derive_tags(uuid4(), _FakeDB(char))
    assert tags == ["character:human"]


@pytest.mark.asyncio
async def test_character_provider_falls_back_to_category_when_no_species():
    char = _char(species=None, category="prop", archetype=None)
    tags = await CharacterSubjectProvider().derive_tags(uuid4(), _FakeDB(char))
    assert tags == ["character:prop"]


@pytest.mark.asyncio
async def test_character_provider_never_raises_on_missing_row():
    tags = await CharacterSubjectProvider().derive_tags(uuid4(), _FakeDB(None))
    assert tags == []


def test_registry_has_builtin_character_provider():
    provider = get_subject_tag_provider("character")
    assert provider is not None
    assert provider.subject_type == "character"
    assert get_subject_tag_provider("nonexistent") is None


def test_registry_register_replaces_by_subject_type():
    class _Dummy:
        subject_type = "character"

        async def derive_tags(self, subject_id, db):
            return ["character:dummy"]

    original = get_subject_tag_provider("character")
    try:
        register_subject_tag_provider(_Dummy())
        assert isinstance(get_subject_tag_provider("character"), _Dummy)
    finally:
        register_subject_tag_provider(original)
        assert get_subject_tag_provider("character") is original


@pytest.mark.asyncio
async def test_deriver_dispatches_subject_through_provider():
    """End-to-end: derive_structural_tags still yields the character subject
    tags (now via the registry) plus the family classification tags."""
    char = _char(species="dragon", category="creature", archetype="guardian")
    tags = await derive_structural_tags(
        authoring_mode_id=None,
        prompt_type="visual",
        category="fantasy",
        primary_character_id=uuid4(),
        npc_id=None,
        db=_FakeDB(char),
    )
    assert "character:dragon" in tags
    assert "archetype:guardian" in tags
    assert "kind:creature" in tags
    assert "type:visual" in tags
    assert "category:fantasy" in tags
