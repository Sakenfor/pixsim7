"""Tests for PromptContextService with resolver and enricher pipeline."""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock

from pixsim7.backend.main.services.characters.prompt_context_service import (
    EnricherFn,
    PromptContextRequest,
    PromptContextService,
    PromptContextSnapshot,
)


@pytest.fixture
def mock_db():
    """Mock async database session."""
    return AsyncMock()


@pytest.fixture
def service(mock_db):
    """PromptContextService instance with mocked dependencies."""
    return PromptContextService(mock_db)


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

    service.db = mock_db
    mock_db.get = AsyncMock(return_value=None)  # No GameNPC

    # Mock instance_service
    mock_instance_service = AsyncMock()
    mock_instance_service.get_instance = AsyncMock(return_value=mock_instance)
    mock_instance_service.get_merged_traits = AsyncMock(return_value={"base_trait": "value"})

    # Patch the NPC resolver's services
    from pixsim7.backend.main.services.characters import prompt_context_service
    original_instance_service = prompt_context_service.CharacterInstanceService

    try:
        prompt_context_service.CharacterInstanceService = lambda db: mock_instance_service

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

    finally:
        # Restore original
        prompt_context_service.CharacterInstanceService = original_instance_service


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
    mock_instance_service.get_merged_traits = AsyncMock(return_value={"trait": "value"})

    service.db = mock_db
    mock_db.get = AsyncMock(return_value=None)

    from pixsim7.backend.main.services.characters import prompt_context_service
    original_instance_service = prompt_context_service.CharacterInstanceService

    try:
        prompt_context_service.CharacterInstanceService = lambda db: mock_instance_service

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

    finally:
        prompt_context_service.CharacterInstanceService = original_instance_service


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
