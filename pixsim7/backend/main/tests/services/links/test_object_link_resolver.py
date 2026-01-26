"""Tests for ObjectLinkResolver"""
import pytest
from uuid import uuid4
from pixsim7.backend.main.services.links.link_types import link_type_id
from pixsim7.backend.main.services.links.object_link_resolver import ObjectLinkResolver, EntityRef


class TestObjectLinkResolver:
    """Tests for ObjectLinkResolver service"""

    def test_init(self, db_session):
        """Test resolver initialization"""
        resolver = ObjectLinkResolver(db_session)

        assert resolver.db == db_session
        assert resolver.loader_registry is not None
        assert resolver.mapping_registry is not None
        assert resolver.link_service is not None
        assert resolver.stat_engine is not None

    @pytest.mark.asyncio
    async def test_load_entity_invalid_kind(self, db_session):
        """Test loading entity with invalid kind raises error"""
        resolver = ObjectLinkResolver(db_session)

        with pytest.raises(ValueError, match="No loader registered for entity kind"):
            await resolver.load_entity('unknown_type', 'id')

    @pytest.mark.asyncio
    async def test_load_entity_character_instance(self, db_session, sample_character_instance):
        """Test loading character instance via registry"""
        resolver = ObjectLinkResolver(db_session)

        character = await resolver.load_entity('characterInstance', str(sample_character_instance.id))

        assert character is not None
        assert character.id == sample_character_instance.id

    @pytest.mark.asyncio
    async def test_load_entity_npc(self, db_session, sample_npc):
        """Test loading NPC entity via registry"""
        resolver = ObjectLinkResolver(db_session)

        npc = await resolver.load_entity('npc', sample_npc.id)

        assert npc is not None
        assert npc.id == sample_npc.id

    @pytest.mark.asyncio
    async def test_resolve_template_to_runtime_no_link(self, db_session, sample_character_instance):
        """Test resolving template with no link returns None"""
        resolver = ObjectLinkResolver(db_session)

        runtime_ref = await resolver.resolve_template_to_runtime(
            'characterInstance',
            str(sample_character_instance.id)
        )

        assert runtime_ref is None

    @pytest.mark.asyncio
    async def test_resolve_template_to_runtime_with_link(
        self,
        db_session,
        sample_object_link
    ):
        """Test resolving template to runtime via ObjectLink"""
        resolver = ObjectLinkResolver(db_session)

        runtime_ref = await resolver.resolve_template_to_runtime(
            sample_object_link.template_kind,
            sample_object_link.template_id
        )

        assert runtime_ref is not None
        assert isinstance(runtime_ref, EntityRef)
        assert runtime_ref.kind == sample_object_link.runtime_kind
        assert runtime_ref.entity_id == sample_object_link.runtime_id
        assert runtime_ref.entity is not None

    @pytest.mark.asyncio
    async def test_resolve_template_to_runtime_disabled_link(
        self,
        db_session,
        sample_object_link_disabled
    ):
        """Test resolving template with disabled link returns None"""
        resolver = ObjectLinkResolver(db_session)

        runtime_ref = await resolver.resolve_template_to_runtime(
            sample_object_link_disabled.template_kind,
            sample_object_link_disabled.template_id
        )

        assert runtime_ref is None

    @pytest.mark.asyncio
    async def test_resolve_prompt_context_no_mapping(self, db_session, sample_character_instance):
        """Test resolving prompt context with no mapping raises error"""
        resolver = ObjectLinkResolver(db_session)

        # Use an unmapped template kind
        with pytest.raises(ValueError, match="No mapping registered"):
            await resolver.resolve_prompt_context(
                'unmapped_kind',
                str(sample_character_instance.id),
                runtime_kind='npc',
                runtime_id=123
            )

    @pytest.mark.asyncio
    async def test_resolve_prompt_context_with_explicit_runtime(
        self,
        db_session,
        sample_character_instance,
        sample_npc
    ):
        """Test resolving prompt context with explicit runtime IDs"""
        resolver = ObjectLinkResolver(db_session)

        resolved_data = await resolver.resolve_prompt_context(
            'characterInstance',
            str(sample_character_instance.id),
            runtime_kind='npc',
            runtime_id=sample_npc.id
        )

        assert resolved_data is not None
        assert isinstance(resolved_data, dict)

    @pytest.mark.asyncio
    async def test_resolve_prompt_context_via_link(
        self,
        db_session,
        sample_object_link
    ):
        """Test resolving prompt context via ObjectLink"""
        resolver = ObjectLinkResolver(db_session)

        resolved_data = await resolver.resolve_prompt_context(
            sample_object_link.template_kind,
            sample_object_link.template_id
        )

        assert resolved_data is not None
        assert isinstance(resolved_data, dict)
        # Should have fields from NPC_FIELD_MAPPING
        # At minimum, should not be empty
        assert len(resolved_data) > 0


# Fixtures for testing
@pytest.fixture
def sample_character_instance(db_session):
    """Create a sample character instance for testing"""
    from pixsim7.backend.main.domain.game.entities.character_integrations import CharacterInstance
    from uuid import uuid4

    instance = CharacterInstance(
        id=uuid4(),
        character_id=uuid4(),
        world_id=1,
        name="Test Character",
        visual_overrides={},
        personality_overrides={},
        behavioral_overrides={},
        current_state={}
    )

    db_session.add(instance)
    db_session.commit()
    db_session.refresh(instance)

    return instance


@pytest.fixture
def sample_npc(db_session):
    """Create a sample NPC for testing"""
    from pixsim7.backend.main.domain.game.core.models import GameNPC

    npc = GameNPC(
        name="Test NPC",
        personality={},
        home_location_id=1
    )

    db_session.add(npc)
    db_session.commit()
    db_session.refresh(npc)

    return npc


@pytest.fixture
def sample_object_link(db_session, sample_character_instance, sample_npc):
    """Create a sample ObjectLink for testing"""
    from pixsim7.backend.main.domain.links import ObjectLink
    from uuid import uuid4

    link = ObjectLink(
        link_id=uuid4(),
        template_kind='characterInstance',
        template_id=str(sample_character_instance.id),
        runtime_kind='npc',
        runtime_id=sample_npc.id,
        sync_enabled=True,
        sync_direction='bidirectional',
        mapping_id=link_type_id('characterInstance', 'npc'),
        priority=10
    )

    db_session.add(link)
    db_session.commit()
    db_session.refresh(link)

    return link


@pytest.fixture
def sample_object_link_disabled(db_session, sample_character_instance, sample_npc):
    """Create a disabled ObjectLink for testing"""
    from pixsim7.backend.main.domain.links import ObjectLink
    from uuid import uuid4

    link = ObjectLink(
        link_id=uuid4(),
        template_kind='characterInstance',
        template_id=str(sample_character_instance.id),
        runtime_kind='npc',
        runtime_id=sample_npc.id,
        sync_enabled=False,  # Disabled
        sync_direction='bidirectional',
        mapping_id=link_type_id('characterInstance', 'npc'),
        priority=10
    )

    db_session.add(link)
    db_session.commit()
    db_session.refresh(link)

    return link
