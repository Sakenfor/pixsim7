from __future__ import annotations

from uuid import uuid4

import pytest

from pixsim7.backend.main.domain.game.entities.character import Character
from pixsim7.backend.main.services.characters.character import CharacterService
from pixsim7.backend.main.services.characters.versioning import CharacterVersioningService


async def _create_character(db_session, *, character_id: str, name: str = "Character", usage_count: int = 0) -> Character:
    character = Character(
        id=uuid4(),
        character_id=character_id,
        name=name,
        display_name=name,
        category="human",
        usage_count=usage_count,
    )
    db_session.add(character)
    await db_session.commit()
    await db_session.refresh(character)
    return character


@pytest.mark.asyncio
async def test_update_character_create_version_true_creates_new_version(db_session):
    service = CharacterService(db_session)
    original = await _create_character(db_session, character_id="char_ver", name="Versioned")

    updated = await service.update_character(
        "char_ver",
        updates={"name": "Versioned v2"},
        create_version=True,
        version_message="evolved",
    )

    assert updated.id != original.id
    assert updated.version_number == 2
    assert updated.parent_character_id == original.id
    assert updated.version_message == "evolved"

    versioning = CharacterVersioningService(db_session)
    family = await versioning.get_family(updated.version_family_id)
    assert family is not None
    assert family.head_character_id == updated.id


@pytest.mark.asyncio
async def test_update_character_in_place_path(db_session):
    service = CharacterService(db_session)
    original = await _create_character(db_session, character_id="char_in_place", name="Editable")

    updated = await service.update_character(
        "char_in_place",
        updates={"name": "Edited", "tags": {"state": "changed"}},
        create_version=False,
    )

    assert updated.id == original.id
    assert updated.name == "Edited"
    assert updated.tags == {"state": "changed"}
    assert updated.version_family_id is None


@pytest.mark.asyncio
async def test_delete_character_soft_and_hard(db_session):
    service = CharacterService(db_session)

    soft = await _create_character(db_session, character_id="char_soft", name="Soft")
    hard = await _create_character(db_session, character_id="char_hard", name="Hard")

    soft_deleted = await service.delete_character("char_soft", soft=True)
    hard_deleted = await service.delete_character("char_hard", soft=False)

    assert soft_deleted is True
    assert hard_deleted is True

    soft_refetched = await db_session.get(Character, soft.id)
    hard_refetched = await db_session.get(Character, hard.id)

    assert soft_refetched is not None
    assert soft_refetched.is_active is False
    assert soft_refetched.deleted_at is not None
    assert hard_refetched is None


@pytest.mark.asyncio
async def test_track_usage_increments_usage_count_and_sets_last_used_at(db_session):
    service = CharacterService(db_session)
    character = await _create_character(
        db_session,
        character_id="char_usage",
        name="Usage",
        usage_count=5,
    )

    usage = await service.track_usage(
        "char_usage",
        usage_type="prompt",
        action_block_id="  block-123  ",
        template_reference="{{character:char_usage}}",
    )

    refreshed = await db_session.get(Character, character.id)

    assert usage.character_id == character.id
    assert usage.action_block_id == "block-123"
    assert usage.template_reference == "{{character:char_usage}}"
    assert refreshed is not None
    assert refreshed.usage_count == 6
    assert refreshed.last_used_at is not None


@pytest.mark.asyncio
async def test_get_character_history_returns_family_chain_or_standalone(db_session):
    service = CharacterService(db_session)

    versioned = await _create_character(db_session, character_id="char_hist_family", name="History")
    await service.update_character(
        "char_hist_family",
        updates={"name": "History v2"},
        create_version=True,
        version_message="v2",
    )

    standalone = await _create_character(db_session, character_id="char_hist_solo", name="Solo")

    family_history = await service.get_character_history("char_hist_family")
    standalone_history = await service.get_character_history("char_hist_solo")

    assert [c.version_number for c in family_history] == [1, 2]
    assert len(standalone_history) == 1
    assert standalone_history[0].id == standalone.id
