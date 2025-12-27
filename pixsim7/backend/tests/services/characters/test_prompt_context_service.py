"""Tests for PromptContextService with resolver and enricher pipeline."""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, Mock

from pixsim7.backend.main.services.prompt.context.resolver import (
    _NpcContextResolver,
    EnricherFn,
    PromptContextRequest,
    PromptContextService,
    PromptContextSnapshot,
)
from pixsim7.backend.main.services.prompt.context.mappings.npc import (
    get_npc_field_mapping,
)


@pytest.fixture
def mock_db():
    """Mock async database session."""
    return AsyncMock()


@pytest.fixture
def mock_instance_service():
    """Mock CharacterInstanceService."""
    service = AsyncMock()

    # Mock instance
    mock_instance = MagicMock()
    mock_instance.name = "Test NPC"
    mock_instance.world_id = 1

    service.get_instance = AsyncMock(return_value=mock_instance)
    service.get_merged_traits = AsyncMock(return_value={
        "personality_traits": {
            "openness": 75.0,
            "conscientiousness": 60.0,
            "extraversion": 50.0,
            "agreeableness": 80.0,
            "neuroticism": 30.0,
        }
    })

    return service


@pytest.fixture
def mock_sync_service():
    """Mock CharacterNPCSyncService."""
    service = AsyncMock()
    service.get_links_for_instance = AsyncMock(return_value=[])
    return service


@pytest.fixture
def mock_stat_engine():
    """Mock StatEngine."""
    engine = Mock()
    engine.normalize_entity_stats = Mock(return_value={
        "openness": 75.0,
        "opennessTierId": "openness_high",
        "conscientiousness": 60.0,
        "conscientiousnessTierId": "conscientiousness_high",
        "extraversion": 50.0,
        "extraversionTierId": "extraversion_moderate",
        "agreeableness": 80.0,
        "agreeablenessTierId": "agreeableness_very_high",
        "neuroticism": 30.0,
        "neuroticismTierId": "neuroticism_low",
    })
    return engine


@pytest.fixture
def npc_resolver(mock_db, mock_instance_service, mock_sync_service, mock_stat_engine):
    """NPC resolver with injected mocks."""
    return _NpcContextResolver(
        db=mock_db,
        instance_service=mock_instance_service,
        sync_service=mock_sync_service,
        stat_engine=mock_stat_engine,
        field_mapping=get_npc_field_mapping(),
    )


@pytest.fixture
def service(mock_db):
    """PromptContextService instance with mocked dependencies."""
    return PromptContextService(mock_db)


@pytest.mark.asyncio
async def test_npc_resolver_normalizes_personality_via_stat_engine(npc_resolver, mock_stat_engine):
    """Test that personality fields are normalized via StatEngine."""
    from unittest.mock import patch
    from pixsim7.backend.main.domain.game.stats import StatDefinition, StatAxis, StatTier

    # Create a mock stat package with personality definition
    mock_personality_def = StatDefinition(
        id="personality",
        display_name="Personality",
        description="Big Five personality traits",
        axes=[
            StatAxis(name="openness", min_value=0.0, max_value=100.0, default_value=50.0),
            StatAxis(name="conscientiousness", min_value=0.0, max_value=100.0, default_value=50.0),
            StatAxis(name="extraversion", min_value=0.0, max_value=100.0, default_value=50.0),
            StatAxis(name="agreeableness", min_value=0.0, max_value=100.0, default_value=50.0),
            StatAxis(name="neuroticism", min_value=0.0, max_value=100.0, default_value=50.0),
        ],
        tiers=[],
        levels=[],
    )

    mock_package = Mock()
    mock_package.definitions = {"personality": mock_personality_def}

    instance_id = uuid4()

    # Mock get_stat_package to return our mock package
    with patch('pixsim7.backend.main.domain.stats.get_stat_package', return_value=mock_package):
        snapshot = await npc_resolver.resolve(
            PromptContextRequest(
                entity_type="npc",
                template_id=str(instance_id),
                runtime_id=None,
                prefer_live=True,
            )
        )

    # Verify StatEngine was called with personality stats
    mock_stat_engine.normalize_entity_stats.assert_called_once()

    # Verify snapshot contains normalized tier IDs
    assert "opennessTierId" in snapshot.traits
    assert snapshot.traits["opennessTierId"] == "openness_high"
    assert "agreeablenessTierId" in snapshot.traits
    assert snapshot.traits["agreeablenessTierId"] == "agreeableness_very_high"


@pytest.mark.asyncio
async def test_field_mapping_authority_instance_wins(npc_resolver):
    """Test that field mapping authority is respected (instance wins for personality)."""

    instance_id = uuid4()

    snapshot = await npc_resolver.resolve(
        PromptContextRequest(
            entity_type="npc",
            template_id=str(instance_id),
            runtime_id=None,
        )
    )

    # Personality should come from instance (per mapping)
    assert snapshot.source == "snapshot"
    assert "openness" in snapshot.traits


@pytest.mark.asyncio
async def test_fallback_when_npc_absent(npc_resolver):
    """Test fallback behavior when NPC is not available."""

    instance_id = uuid4()

    snapshot = await npc_resolver.resolve(
        PromptContextRequest(
            entity_type="npc",
            template_id=str(instance_id),
            runtime_id=None,
        )
    )

    assert snapshot.source == "snapshot"
    assert snapshot.runtime_id is None
    assert snapshot.name == "Test NPC"  # Fallback to instance


@pytest.mark.asyncio
async def test_enricher_pipeline(service, mock_db):
    """Test that enrichers run after resolver and can augment snapshot."""

    # Mock enricher that adds relationship tier to traits
    async def add_relationship_tier(
        snapshot: PromptContextSnapshot,
        request: PromptContextRequest
    ) -> PromptContextSnapshot:
        snapshot.traits["relationship_tier"] = "friendly"
        snapshot.traits["enriched"] = True
        return snapshot

    # Register enricher
    service.register_enricher("npc", add_relationship_tier)

    # Mock the instance service and NPC resolver dependencies
    mock_instance = MagicMock()
    mock_instance.name = "Test NPC"
    mock_instance.world_id = 1

    mock_instance_service = AsyncMock()
    mock_instance_service.get_instance = AsyncMock(return_value=mock_instance)
    mock_instance_service.get_merged_traits = AsyncMock(return_value={
        "personality_traits": {
            "openness": 75.0,
        }
    })

    mock_sync_service = AsyncMock()
    mock_sync_service.get_links_for_instance = AsyncMock(return_value=[])

    mock_stat_engine = Mock()
    mock_stat_engine.normalize_entity_stats = Mock(return_value={
        "openness": 75.0,
        "opennessTierId": "openness_high",
    })

    # Create custom resolver with mocks
    npc_resolver = _NpcContextResolver(
        db=mock_db,
        instance_service=mock_instance_service,
        sync_service=mock_sync_service,
        stat_engine=mock_stat_engine,
        field_mapping=get_npc_field_mapping(),
    )

    # Replace the default resolver
    service.register_resolver("npc", npc_resolver)

    # Mock db.get to return None (no GameNPC)
    service.db = mock_db
    mock_db.get = AsyncMock(return_value=None)

    # Resolve context
    instance_id = uuid4()
    context = await service.get_prompt_context(
        PromptContextRequest(
            entity_type="npc",
            template_id=str(instance_id),
            runtime_id=None
        )
    )

    # Verify enricher ran and augmented the snapshot
    assert "relationship_tier" in context.traits
    assert context.traits["relationship_tier"] == "friendly"
    assert context.traits["enriched"] is True


@pytest.mark.asyncio
async def test_no_resolver_registered(service):
    """Test that get_prompt_context raises ValueError for unknown entity type."""

    with pytest.raises(ValueError, match="No prompt context resolver registered"):
        await service.get_prompt_context(
            PromptContextRequest(
                entity_type="unknown_entity_type",
                template_id="some_id",
            )
        )


@pytest.mark.asyncio
async def test_snapshot_to_dict():
    """Test that PromptContextSnapshot.to_dict() includes all fields."""

    snapshot = PromptContextSnapshot(
        entity_type="npc",
        template_id="abc-123",
        runtime_id="456",
        name="Koba",
        traits={"personality": "curious"},
        state={"mood": "happy"},
        location_id=5,
        source="live",
        world_id=1,
    )

    result = snapshot.to_dict()

    assert result["entity_type"] == "npc"
    assert result["template_id"] == "abc-123"
    assert result["runtime_id"] == "456"
    assert result["name"] == "Koba"
    assert result["traits"] == {"personality": "curious"}
    assert result["state"] == {"mood": "happy"}
    assert result["location_id"] == 5
    assert result["source"] == "live"
    assert result["world_id"] == 1


@pytest.mark.asyncio
async def test_backward_compatible_npc_helper(service, mock_db):
    """Test get_npc_prompt_context backward-compatible helper."""

    # Mock dependencies
    mock_instance = MagicMock()
    mock_instance.name = "Test NPC"
    mock_instance.world_id = 1

    mock_instance_service = AsyncMock()
    mock_instance_service.get_instance = AsyncMock(return_value=mock_instance)
    mock_instance_service.get_merged_traits = AsyncMock(return_value={
        "personality_traits": {"trait": "value"}
    })

    mock_sync_service = AsyncMock()
    mock_sync_service.get_links_for_instance = AsyncMock(return_value=[])

    mock_stat_engine = Mock()
    mock_stat_engine.normalize_entity_stats = Mock(return_value={})

    # Create custom resolver with mocks
    npc_resolver = _NpcContextResolver(
        db=mock_db,
        instance_service=mock_instance_service,
        sync_service=mock_sync_service,
        stat_engine=mock_stat_engine,
        field_mapping=get_npc_field_mapping(),
    )

    # Replace the default resolver
    service.register_resolver("npc", npc_resolver)
    service.db = mock_db
    mock_db.get = AsyncMock(return_value=None)

    instance_id = uuid4()
    context = await service.get_npc_prompt_context(
        instance_id=instance_id,
        npc_id=None,
        prefer_live=True
    )

    assert context.entity_type == "npc"
    assert context.template_id == str(instance_id)
    assert context.name == "Test NPC"
    assert context.source == "snapshot"


def test_register_enricher_creates_list(service):
    """Test that register_enricher creates a new list for new entity types."""

    async def dummy_enricher(snapshot, request):
        return snapshot

    service.register_enricher("new_entity", dummy_enricher)

    assert "new_entity" in service._enrichers
    assert len(service._enrichers["new_entity"]) == 1
    assert service._enrichers["new_entity"][0] is dummy_enricher


def test_register_enricher_appends_to_existing(service):
    """Test that register_enricher appends to existing enricher list."""

    async def enricher1(snapshot, request):
        return snapshot

    async def enricher2(snapshot, request):
        return snapshot

    service.register_enricher("npc", enricher1)
    service.register_enricher("npc", enricher2)

    assert len(service._enrichers["npc"]) >= 2
    assert enricher1 in service._enrichers["npc"]
    assert enricher2 in service._enrichers["npc"]
