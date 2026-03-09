from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio

from pixsim7.backend.main.domain.game.core.models import GameNPC
from pixsim7.backend.main.domain.game.entities.character import Character
from pixsim7.backend.main.domain.game.entities.character_integrations import CharacterInstance
from pixsim7.backend.main.services.links.link_service import LinkService
from pixsim7.backend.main.services.links.link_types import link_type_id


@pytest_asyncio.fixture
async def sample_character(db_session):
    character = Character(
        id=uuid4(),
        character_id=f"char-{uuid4().hex}",
        name="Link Character",
        category="human",
    )
    db_session.add(character)
    await db_session.commit()
    await db_session.refresh(character)
    return character


@pytest_asyncio.fixture
async def sample_template_instance(db_session, sample_character):
    instance = CharacterInstance(
        id=uuid4(),
        character_id=sample_character.id,
        world_id=None,
        instance_name="Template Instance",
        visual_overrides={},
        personality_overrides={},
        behavioral_overrides={},
        current_state={},
    )
    db_session.add(instance)
    await db_session.commit()
    await db_session.refresh(instance)
    return instance


@pytest_asyncio.fixture
async def sample_npc(db_session):
    npc = GameNPC(name="NPC", personality={}, home_location_id=None)
    db_session.add(npc)
    await db_session.commit()
    await db_session.refresh(npc)
    return npc


@pytest.mark.asyncio
async def test_one_template_can_link_to_many_runtime_entities(db_session, sample_template_instance):
    service = LinkService(db_session)

    npc_1 = GameNPC(name="NPC-1", personality={}, home_location_id=None)
    npc_2 = GameNPC(name="NPC-2", personality={}, home_location_id=None)
    db_session.add(npc_1)
    db_session.add(npc_2)
    await db_session.commit()
    await db_session.refresh(npc_1)
    await db_session.refresh(npc_2)

    await service.create_link(
        template_kind="characterInstance",
        template_id=str(sample_template_instance.id),
        runtime_kind="npc",
        runtime_id=npc_1.id,
        priority=5,
    )
    await service.create_link(
        template_kind="characterInstance",
        template_id=str(sample_template_instance.id),
        runtime_kind="npc",
        runtime_id=npc_2.id,
        priority=10,
    )
    await db_session.commit()

    links = await service.get_links_for_template("characterInstance", str(sample_template_instance.id))

    assert sorted(link.runtime_id for link in links) == sorted([npc_1.id, npc_2.id])


@pytest.mark.asyncio
async def test_priority_winner_resolution_and_disabled_links_excluded(db_session, sample_template_instance, sample_npc):
    service = LinkService(db_session)

    await service.create_link(
        template_kind="characterInstance",
        template_id=str(sample_template_instance.id),
        runtime_kind="npc",
        runtime_id=sample_npc.id,
        priority=100,
        sync_enabled=False,
    )
    expected = await service.create_link(
        template_kind="characterInstance",
        template_id=str(sample_template_instance.id),
        runtime_kind="npc",
        runtime_id=sample_npc.id,
        priority=50,
        sync_enabled=True,
    )
    await db_session.commit()

    active = await service.get_active_link_for_runtime("npc", sample_npc.id, context={})

    assert active is not None
    assert active.link_id == expected.link_id


@pytest.mark.asyncio
async def test_activation_condition_filtering_and_no_context_behavior(db_session, sample_template_instance, sample_npc):
    service = LinkService(db_session)

    unconditional = await service.create_link(
        template_kind="characterInstance",
        template_id=str(sample_template_instance.id),
        runtime_kind="npc",
        runtime_id=sample_npc.id,
        priority=10,
    )
    conditional = await service.create_link(
        template_kind="characterInstance",
        template_id=str(sample_template_instance.id),
        runtime_kind="npc",
        runtime_id=sample_npc.id,
        priority=20,
        activation_conditions={"location.zone": "downtown"},
    )
    await db_session.commit()

    active_links = await service.get_links_for_runtime(
        "npc",
        sample_npc.id,
        active_only=True,
        context={"location": {"zone": "downtown"}},
    )
    no_context_active = await service.get_active_link_for_runtime("npc", sample_npc.id, context=None)

    assert [link.link_id for link in active_links] == [conditional.link_id, unconditional.link_id]
    assert no_context_active is not None
    assert no_context_active.link_id == unconditional.link_id


@pytest.mark.asyncio
async def test_create_update_delete_link_flow(db_session, sample_template_instance, sample_npc):
    service = LinkService(db_session)

    link = await service.create_link(
        template_kind="characterInstance",
        template_id=str(sample_template_instance.id),
        runtime_kind="npc",
        runtime_id=sample_npc.id,
        mapping_id=link_type_id("characterInstance", "npc"),
        priority=1,
        sync_enabled=True,
    )
    await db_session.commit()

    updated = await service.update_link(
        link.link_id,
        priority=42,
        sync_enabled=False,
        meta={"reason": "test"},
    )
    await db_session.commit()

    assert updated is not None
    assert updated.priority == 42
    assert updated.sync_enabled is False
    assert updated.meta == {"reason": "test"}

    deleted = await service.delete_link(link.link_id)
    deleted_again = await service.delete_link(link.link_id)
    await db_session.commit()

    assert deleted is True
    assert deleted_again is False
    assert await service.get_link(link.link_id) is None
