"""
Tests for Relationship Preview API

Tests the preview endpoints for relationship tier and intimacy level computation.
"""

import pytest
from httpx import AsyncClient
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from pixsim7.backend.main.api.v1.game_relationship_preview import router
from pixsim7.backend.main.domain.game.models import GameWorld
from pixsim7.backend.main.infrastructure.database.session import get_db


@pytest.fixture
def app() -> FastAPI:
    """Create test app with relationship preview router."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/game/relationships")
    return app


@pytest.fixture
async def client(app: FastAPI):
    """Create test client."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def test_world(app: FastAPI):
    """
    Create a test world with custom relationship schemas.

    Note: This fixture requires a real database connection.
    For unit tests, mock the database dependency instead.
    """
    async for db in get_db():
        # Create test world with custom schemas
        world = GameWorld(
            owner_user_id=1,
            name="Test World",
            meta={
                "relationship_schemas": {
                    "default": [
                        {"id": "stranger", "min": 0, "max": 19},
                        {"id": "acquaintance", "min": 20, "max": 39},
                        {"id": "friend", "min": 40, "max": 69},
                        {"id": "close_friend", "min": 70, "max": 89},
                        {"id": "lover", "min": 90},
                    ],
                    "professional": [
                        {"id": "unknown", "min": 0, "max": 29},
                        {"id": "colleague", "min": 30, "max": 59},
                        {"id": "partner", "min": 60},
                    ],
                },
                "intimacy_schema": {
                    "levels": [
                        {
                            "id": "platonic",
                            "minAffinity": 0,
                            "minTrust": 0,
                            "minChemistry": 0,
                            "maxTension": 100,
                        },
                        {
                            "id": "light_flirt",
                            "minAffinity": 30,
                            "minTrust": 20,
                            "minChemistry": 30,
                            "maxTension": 40,
                        },
                        {
                            "id": "deep_flirt",
                            "minAffinity": 50,
                            "minTrust": 30,
                            "minChemistry": 50,
                            "maxTension": 30,
                        },
                        {
                            "id": "intimate",
                            "minAffinity": 70,
                            "minTrust": 50,
                            "minChemistry": 70,
                            "maxTension": 20,
                        },
                        {
                            "id": "very_intimate",
                            "minAffinity": 85,
                            "minTrust": 70,
                            "minChemistry": 85,
                            "maxTension": 10,
                        },
                    ]
                },
            },
        )

        db.add(world)
        await db.commit()
        await db.refresh(world)

        yield world

        # Cleanup
        await db.delete(world)
        await db.commit()
        break


# ===== Relationship Tier Tests =====


@pytest.mark.asyncio
async def test_preview_tier_default_schema(client: AsyncClient, test_world: GameWorld):
    """Test tier preview with default schema."""
    response = await client.post(
        "/api/v1/game/relationships/preview-tier",
        json={"world_id": test_world.id, "affinity": 75.0, "schema_key": "default"},
    )

    assert response.status_code == 200
    data = response.json()

    assert data["tier_id"] == "close_friend"
    assert data["schema_key"] == "default"
    assert data["affinity"] == 75.0


@pytest.mark.asyncio
async def test_preview_tier_custom_schema(client: AsyncClient, test_world: GameWorld):
    """Test tier preview with custom schema."""
    response = await client.post(
        "/api/v1/game/relationships/preview-tier",
        json={
            "world_id": test_world.id,
            "affinity": 50.0,
            "schema_key": "professional",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["tier_id"] == "colleague"
    assert data["schema_key"] == "professional"
    assert data["affinity"] == 50.0


@pytest.mark.asyncio
async def test_preview_tier_boundary_values(client: AsyncClient, test_world: GameWorld):
    """Test tier preview at schema boundary values."""
    # Test at exact threshold
    response = await client.post(
        "/api/v1/game/relationships/preview-tier",
        json={"world_id": test_world.id, "affinity": 70.0},
    )

    assert response.status_code == 200
    assert response.json()["tier_id"] == "close_friend"

    # Test at upper boundary
    response = await client.post(
        "/api/v1/game/relationships/preview-tier",
        json={"world_id": test_world.id, "affinity": 89.0},
    )

    assert response.status_code == 200
    assert response.json()["tier_id"] == "close_friend"

    # Test at open-ended range
    response = await client.post(
        "/api/v1/game/relationships/preview-tier",
        json={"world_id": test_world.id, "affinity": 95.0},
    )

    assert response.status_code == 200
    assert response.json()["tier_id"] == "lover"


@pytest.mark.asyncio
async def test_preview_tier_world_not_found(client: AsyncClient):
    """Test tier preview with non-existent world."""
    response = await client.post(
        "/api/v1/game/relationships/preview-tier",
        json={"world_id": 999999, "affinity": 50.0},
    )

    assert response.status_code == 404
    data = response.json()
    assert "World not found" in data["detail"]["error"]
    assert data["detail"]["world_id"] == 999999


@pytest.mark.asyncio
async def test_preview_tier_missing_affinity(client: AsyncClient, test_world: GameWorld):
    """Test tier preview with missing required field."""
    response = await client.post(
        "/api/v1/game/relationships/preview-tier", json={"world_id": test_world.id}
    )

    assert response.status_code == 422  # Pydantic validation error


# ===== Intimacy Level Tests =====


@pytest.mark.asyncio
async def test_preview_intimacy_basic(client: AsyncClient, test_world: GameWorld):
    """Test intimacy preview with valid values."""
    response = await client.post(
        "/api/v1/game/relationships/preview-intimacy",
        json={
            "world_id": test_world.id,
            "relationship_values": {
                "affinity": 75.0,
                "trust": 55.0,
                "chemistry": 75.0,
                "tension": 15.0,
            },
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["intimacy_level_id"] == "intimate"
    assert data["relationship_values"]["affinity"] == 75.0
    assert data["relationship_values"]["trust"] == 55.0
    assert data["relationship_values"]["chemistry"] == 75.0
    assert data["relationship_values"]["tension"] == 15.0


@pytest.mark.asyncio
async def test_preview_intimacy_very_intimate(
    client: AsyncClient, test_world: GameWorld
):
    """Test intimacy preview for very intimate level."""
    response = await client.post(
        "/api/v1/game/relationships/preview-intimacy",
        json={
            "world_id": test_world.id,
            "relationship_values": {
                "affinity": 90.0,
                "trust": 75.0,
                "chemistry": 90.0,
                "tension": 5.0,
            },
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["intimacy_level_id"] == "very_intimate"


@pytest.mark.asyncio
async def test_preview_intimacy_platonic(client: AsyncClient, test_world: GameWorld):
    """Test intimacy preview for platonic level."""
    response = await client.post(
        "/api/v1/game/relationships/preview-intimacy",
        json={
            "world_id": test_world.id,
            "relationship_values": {
                "affinity": 10.0,
                "trust": 10.0,
                "chemistry": 10.0,
                "tension": 50.0,
            },
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["intimacy_level_id"] == "platonic"


@pytest.mark.asyncio
async def test_preview_intimacy_world_not_found(client: AsyncClient):
    """Test intimacy preview with non-existent world."""
    response = await client.post(
        "/api/v1/game/relationships/preview-intimacy",
        json={
            "world_id": 999999,
            "relationship_values": {
                "affinity": 50.0,
                "trust": 50.0,
                "chemistry": 50.0,
                "tension": 10.0,
            },
        },
    )

    assert response.status_code == 404
    data = response.json()
    assert "World not found" in data["detail"]["error"]


@pytest.mark.asyncio
async def test_preview_intimacy_missing_values(
    client: AsyncClient, test_world: GameWorld
):
    """Test intimacy preview with missing relationship values."""
    # Missing chemistry
    response = await client.post(
        "/api/v1/game/relationships/preview-intimacy",
        json={
            "world_id": test_world.id,
            "relationship_values": {
                "affinity": 50.0,
                "trust": 50.0,
                "tension": 10.0,
            },
        },
    )

    assert response.status_code == 422  # Pydantic validation error


# ===== Edge Cases =====


@pytest.mark.asyncio
async def test_preview_tier_negative_affinity(
    client: AsyncClient, test_world: GameWorld
):
    """Test tier preview with negative affinity."""
    response = await client.post(
        "/api/v1/game/relationships/preview-tier",
        json={"world_id": test_world.id, "affinity": -10.0},
    )

    assert response.status_code == 200
    # Should still compute a result (backend logic handles out-of-range values)


@pytest.mark.asyncio
async def test_preview_tier_extreme_affinity(
    client: AsyncClient, test_world: GameWorld
):
    """Test tier preview with very high affinity."""
    response = await client.post(
        "/api/v1/game/relationships/preview-tier",
        json={"world_id": test_world.id, "affinity": 500.0},
    )

    assert response.status_code == 200
    # Should compute a result (likely the highest tier)


@pytest.mark.asyncio
async def test_preview_intimacy_extreme_values(
    client: AsyncClient, test_world: GameWorld
):
    """Test intimacy preview with extreme values."""
    response = await client.post(
        "/api/v1/game/relationships/preview-intimacy",
        json={
            "world_id": test_world.id,
            "relationship_values": {
                "affinity": 1000.0,
                "trust": -50.0,
                "chemistry": 500.0,
                "tension": 200.0,
            },
        },
    )

    assert response.status_code == 200
    # Should still compute a result
