"""
Tests for the generic stat preview API.

These tests verify that the stat preview endpoint correctly computes tiers
and levels for any stat type using world-specific stat configurations.
"""

import asyncio
import pytest
from httpx import AsyncClient
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from pixsim7.backend.main.api.v1.stat_preview import router
from pixsim7.backend.main.api.dependencies import get_database
from pixsim7.backend.main.domain.game.models import GameWorld, Base
from pixsim7.backend.main.domain.stats import get_default_relationship_definition


# Test database setup
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def db_engine():
    """Create a test database engine."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    """Create a test database session."""
    async_session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session_maker() as session:
        yield session


@pytest.fixture
def app(db_session):
    """Create a test FastAPI app with stat preview router."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/stats")

    # Override database dependency to use test session
    async def override_get_database():
        yield db_session

    app.dependency_overrides[get_database] = override_get_database
    return app


@pytest.fixture
async def client(app):
    """Create an async HTTP client for testing."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def test_world(db_session):
    """Create a test world with stat configuration."""
    # Create world with relationship stat definition
    rel_def = get_default_relationship_definition()
    world = GameWorld(
        id=9999,
        name="Test World for Stat Preview",
        meta={
            "stats_config": {
                "version": 1,
                "definitions": {
                    "relationships": rel_def.model_dump()
                }
            }
        }
    )
    db_session.add(world)
    await db_session.commit()
    yield world
    # Cleanup
    await db_session.delete(world)
    await db_session.commit()


@pytest.fixture
async def test_world_no_config(db_session):
    """Create a test world without stat configuration (will use defaults)."""
    world = GameWorld(
        id=9998,
        name="Test World No Config",
        meta={}
    )
    db_session.add(world)
    await db_session.commit()
    yield world
    # Cleanup
    await db_session.delete(world)
    await db_session.commit()


async def test_preview_relationship_stats_basic(client: AsyncClient, test_world):
    """Test basic relationship stat preview with valid values."""
    response = await client.post(
        "/api/v1/stats/preview-entity-stats",
        json={
            "world_id": test_world.id,
            "stat_definition_id": "relationships",
            "values": {
                "affinity": 75.0,
                "trust": 60.0,
                "chemistry": 70.0,
                "tension": 10.0
            }
        }
    ))

    assert response.status_code == 200
    data = response.json()

    # Check structure
    assert data["stat_definition_id"] == "relationships"
    assert "normalized_stats" in data

    normalized = data["normalized_stats"]

    # Check clamped values
    assert normalized["affinity"] == 75.0
    assert normalized["trust"] == 60.0
    assert normalized["chemistry"] == 70.0
    assert normalized["tension"] == 10.0

    # Check computed tier IDs (based on default relationship definition)
    # affinity 75 should be "close_friend" tier (60-79.99)
    assert "affinityTierId" in normalized
    assert normalized["affinityTierId"] == "close_friend"

    # Check computed level ID (multi-axis)
    # With affinity=75, trust=60, chemistry=70, should meet "intimate" level requirements
    assert "levelId" in normalized


async def test_preview_relationship_stats_clamping(client: AsyncClient, test_world):
    """Test that preview correctly clamps values to stat definition ranges."""
    response = await client.post(
        "/api/v1/stats/preview-entity-stats",
        json={
            "world_id": test_world.id,
            "stat_definition_id": "relationships",
            "values": {
                "affinity": 150.0,  # Exceeds max of 100
                "trust": -50.0,     # Below min of 0
                "chemistry": 50.0,
                "tension": 0.0
            }
        }
    ))

    assert response.status_code == 200
    data = response.json()
    normalized = data["normalized_stats"]

    # Values should be clamped to [0, 100]
    assert normalized["affinity"] == 100.0  # Clamped to max
    assert normalized["trust"] == 0.0       # Clamped to min
    assert normalized["chemistry"] == 50.0  # Within range
    assert normalized["tension"] == 0.0


async def test_preview_relationship_stats_tier_computation(client: AsyncClient, test_world):
    """Test that tiers are computed correctly across different value ranges."""
    test_cases = [
        # (affinity_value, expected_tier)
        (5.0, "stranger"),         # 0-9.99
        (15.0, "acquaintance"),    # 10-29.99
        (40.0, "friend"),          # 30-59.99
        (70.0, "close_friend"),    # 60-79.99
        (90.0, "lover"),           # 80-100
    ]

    for affinity, expected_tier in test_cases:
        response = await client.post(
            "/api/v1/stats/preview-entity-stats",
            json={
                "world_id": test_world.id,
                "stat_definition_id": "relationships",
                "values": {
                    "affinity": affinity,
                    "trust": 50.0,
                    "chemistry": 50.0,
                    "tension": 0.0
                }
            }
        ))

        assert response.status_code == 200
        normalized = response.json()["normalized_stats"]
        assert normalized["affinityTierId"] == expected_tier, \
            f"Affinity {affinity} should map to tier '{expected_tier}', got '{normalized.get('affinityTierId')}'"


async def test_preview_relationship_stats_level_computation(client: AsyncClient, test_world):
    """Test that multi-axis levels are computed correctly."""
    # Test "intimate" level requirements: affinity>=60, chemistry>=60, trust>=40
    response = await client.post(
        "/api/v1/stats/preview-entity-stats",
        json={
            "world_id": test_world.id,
            "stat_definition_id": "relationships",
            "values": {
                "affinity": 65.0,
                "trust": 45.0,
                "chemistry": 65.0,
                "tension": 20.0
            }
        }
    ))

    assert response.status_code == 200
    normalized = response.json()["normalized_stats"]

    # Should meet "intimate" level requirements
    assert "levelId" in normalized
    assert normalized["levelId"] == "intimate"


async def test_preview_relationship_stats_no_config_uses_default(client: AsyncClient, test_world_no_config):
    """Test that worlds without stat config fall back to default relationship definition."""
    response = await client.post(
        "/api/v1/stats/preview-entity-stats",
        json={
            "world_id": test_world_no_config.id,
            "stat_definition_id": "relationships",
            "values": {
                "affinity": 75.0,
                "trust": 60.0,
                "chemistry": 70.0,
                "tension": 10.0
            }
        }
    ))

    assert response.status_code == 200
    data = response.json()

    # Should still work using default definition
    assert data["stat_definition_id"] == "relationships"
    normalized = data["normalized_stats"]
    assert normalized["affinity"] == 75.0
    assert "affinityTierId" in normalized


async def test_preview_stats_world_not_found(client: AsyncClient):
    """Test that non-existent world returns 404."""
    response = await client.post(
        "/api/v1/stats/preview-entity-stats",
        json={
            "world_id": 999999,  # Non-existent world
            "stat_definition_id": "relationships",
            "values": {"affinity": 50.0}
        }
    ))

    assert response.status_code == 404
    error = response.json()
    assert "error" in error
    assert "World not found" in error["error"]


async def test_preview_stats_unsupported_stat_type(client: AsyncClient, test_world):
    """Test that unsupported stat types return 400."""
    response = await client.post(
        "/api/v1/stats/preview-entity-stats",
        json={
            "world_id": test_world.id,
            "stat_definition_id": "unsupported_stat_type",
            "values": {"foo": 50.0}
        }
    ))

    assert response.status_code == 400
    error = response.json()
    assert "error" in error
    assert "Stat definition not found" in error["error"] or "not configured" in error["error"]


async def test_preview_stats_invalid_request(client: AsyncClient, test_world):
    """Test that invalid requests return 400."""
    # Missing required field
    response = await client.post(
        "/api/v1/stats/preview-entity-stats",
        json={
            "world_id": test_world.id,
            # Missing stat_definition_id
            "values": {"affinity": 50.0}
        }
    ))

    assert response.status_code == 422  # Pydantic validation error


async def test_preview_stats_partial_values(client: AsyncClient, test_world):
    """Test that partial axis values work (missing axes get defaults)."""
    response = await client.post(
        "/api/v1/stats/preview-entity-stats",
        json={
            "world_id": test_world.id,
            "stat_definition_id": "relationships",
            "values": {
                "affinity": 80.0,
                # Missing: trust, chemistry, tension
            }
        }
    ))

    assert response.status_code == 200
    normalized = response.json()["normalized_stats"]

    # Provided value should be preserved
    assert normalized["affinity"] == 80.0

    # Missing values should get defaults or be omitted
    # (behavior depends on StatEngine.normalize_entity_stats implementation)


async def test_preview_stats_empty_values(client: AsyncClient, test_world):
    """Test that empty values dict is handled gracefully."""
    response = await client.post(
        "/api/v1/stats/preview-entity-stats",
        json={
            "world_id": test_world.id,
            "stat_definition_id": "relationships",
            "values": {}
        }
    ))

    # Should succeed with all default values
    assert response.status_code == 200
    normalized = response.json()["normalized_stats"]

    # Should have computed default tier/level IDs
    # (exact behavior depends on defaults in the stat definition)
    assert isinstance(normalized, dict)
