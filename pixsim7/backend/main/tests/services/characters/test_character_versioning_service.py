from __future__ import annotations

from uuid import uuid4

import pytest

from pixsim7.backend.main.domain.game.entities.character import Character
from pixsim7.backend.main.services.characters.versioning import CharacterVersioningService


async def _create_character(db_session, *, character_id: str, name: str = "Character") -> Character:
    character = Character(
        id=uuid4(),
        character_id=character_id,
        name=name,
        display_name=name,
        category="human",
    )
    db_session.add(character)
    await db_session.commit()
    await db_session.refresh(character)
    return character


@pytest.mark.asyncio
async def test_evolve_first_time_creates_family_and_v1_baseline(db_session):
    service = CharacterVersioningService(db_session)
    original = await _create_character(db_session, character_id="hero_1", name="Hero")

    evolved = await service.evolve(
        original,
        updates={"name": "Hero v2", "display_name": "Hero Two"},
        message="Initial evolution",
    )
    await db_session.commit()

    assert original.version_family_id is not None
    assert original.version_number == 1
    assert original.parent_character_id is None

    assert evolved.version_family_id == original.version_family_id
    assert evolved.version_number == 2
    assert evolved.parent_character_id == original.id
    assert evolved.version_message == "Initial evolution"

    family = await service.get_family(original.version_family_id)
    assert family is not None
    assert family.head_character_id == evolved.id


@pytest.mark.asyncio
async def test_evolve_subsequent_versions_increment_and_update_head_with_parent_linkage(db_session):
    service = CharacterVersioningService(db_session)
    v1 = await _create_character(db_session, character_id="hero_2", name="Hero")

    v2 = await service.evolve(v1, updates={"name": "Hero v2"}, message="v2")
    await db_session.commit()
    v3 = await service.evolve(v2, updates={"name": "Hero v3"}, message="v3")
    await db_session.commit()

    assert v2.version_number == 2
    assert v3.version_number == 3
    assert v2.parent_character_id == v1.id
    assert v3.parent_character_id == v2.id

    family = await service.get_family(v1.version_family_id)
    assert family is not None
    assert family.head_character_id == v3.id


@pytest.mark.asyncio
async def test_get_head_character_prefers_family_head_and_falls_back_to_standalone(db_session):
    service = CharacterVersioningService(db_session)

    family_root = await _create_character(db_session, character_id="hero_head", name="Heady")
    family_head = await service.evolve(family_root, updates={"name": "Heady v2"}, message="evolve")
    await db_session.commit()

    standalone = await _create_character(db_session, character_id="solo_head", name="Solo")

    resolved_family_head = await service.get_head_character("hero_head")
    resolved_standalone = await service.get_head_character("solo_head")

    assert resolved_family_head is not None
    assert resolved_family_head.id == family_head.id

    assert resolved_standalone is not None
    assert resolved_standalone.id == standalone.id
